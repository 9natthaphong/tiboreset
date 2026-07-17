import { describe, expect, it } from "vitest";
import type { Evidence } from "@/lib/forecasting";
import { announcementOutcome, binaryMetrics, eventResults, executionOutcome, generateCutoffs, hasCompleteOutcomeHorizon, honestBacktestStatus, mergeUniquePosts, requiresExternalAcquisition, runWalkForward, thresholdCrossing, type RollingRow, type VerifiedAnnouncement } from "@/lib/month-backtest";

const event = (overrides: Partial<VerifiedAnnouncement> = {}): VerifiedAnnouncement => ({ id: "reset-1", announcedAt: "2026-07-10T12:00:00Z", resetType: "full", milestoneUsers: 6_000_000, sourcePostId: "announcement", sourceUrl: "https://x.com/example", executionAt: null, executionVerified: false, ...overrides });
const evidence = (postId: string, postedAt: string, eventType: Evidence["eventType"] = "reset_hint"): Evidence => ({ id: postId, postId, postedAt, excerpt: postId, eventType, confidence: .9, verified: true, url: "#", effect: 8, sourceType: "official_x", commitmentStrength: .8 });

describe("strict monthly backtest", () => {
  it("prevents cutoff leakage", () => {
    const rows = runWalkForward({ cutoffs: ["2026-07-10T00:00:00Z"], horizonHours: 36, evidence: [evidence("past", "2026-07-09T00:00:00Z"), evidence("future", "2026-07-10T01:00:00Z")], events: [event()], test: "realtime" });
    expect(rows[0].evidenceIds).toContain("past");
    expect(rows[0].evidenceIds).not.toContain("future");
  });

  it("excludes the target announcement post", () => {
    const rows = runWalkForward({ cutoffs: ["2026-07-11T00:00:00Z"], horizonHours: 36, evidence: [evidence("announcement", "2026-07-10T12:00:00Z", "explicit_reset_confirmation")], events: [event()], excludedPostIds: new Set(["announcement"]), test: "strict_pre_announcement" });
    expect(rows[0].evidenceIds).not.toContain("announcement");
  });

  it("keeps any confirmation-only evidence out of the strict forecast", () => {
    const confirmation = evidence("unscored-confirmation", "2026-06-18T00:00:00Z", "explicit_reset_confirmation");
    const rows = runWalkForward({ cutoffs: ["2026-07-01T00:00:00Z"], horizonHours: 36, evidence: [confirmation], events: [event()], excludedPostIds: new Set([confirmation.postId]), test: "strict_pre_announcement" });
    expect(rows[0].features.explicit_reset_confirmation).toBe(0);
  });

  it("keeps scheduled announcements distinct from verified execution", () => {
    const scheduled = event({ resetType: "scheduled" });
    expect(announcementOutcome("2026-07-10T00:00:00Z", 36, [scheduled])).toBe(true);
    expect(executionOutcome("2026-07-10T00:00:00Z", 36, [scheduled])).toBeNull();
  });

  it("counts negative windows and calculates metrics", () => {
    const rows = [row(.8, true), row(.2, false), row(.4, false)];
    const metrics = binaryMetrics(rows);
    expect(metrics.positiveWindows).toBe(1);
    expect(metrics.negativeWindows).toBe(2);
    expect(metrics.brierScore).toBeCloseTo(.08);
    expect(metrics.rocAuc).toBe(1);
  });

  it("calculates threshold lead time", () => {
    const rows = [row(.2, false, "2026-07-10T00:00:00Z"), row(.6, true, "2026-07-10T06:00:00Z")];
    expect(thresholdCrossing(rows, "2026-07-10T12:00:00Z", .5)).toEqual({ at: "2026-07-10T06:00:00Z", leadHours: 6 });
    expect(eventResults(rows, [event()])[0].thresholdCrossings["0.5"]).toBeTruthy();
  });

  it("deduplicates cached posts and makes completed reruns external-call free", () => {
    expect(mergeUniquePosts([{ id: "1" }], [{ id: "1" }, { id: "2" }])).toHaveLength(2);
    expect(requiresExternalAcquisition({ complete: true })).toBe(false);
    expect(requiresExternalAcquisition({ complete: true }, true)).toBe(true);
  });

  it("creates exactly 120 six-hour cutoffs for the month", () => expect(generateCutoffs("2026-06-17T00:00:00Z", "2026-07-17T00:00:00Z", 6)).toHaveLength(120));

  it("does not label a cutoff as negative when its outcome horizon crosses the evaluation boundary", () => {
    expect(hasCompleteOutcomeHorizon("2026-07-15T12:00:00Z", "2026-07-17T00:00:00Z", 36)).toBe(true);
    expect(hasCompleteOutcomeHorizon("2026-07-15T18:00:00Z", "2026-07-17T00:00:00Z", 36)).toBe(false);
  });

  it("shows an honest insufficiency state publicly", () => expect(honestBacktestStatus({ interpretation: "Insufficient data", brierSkillScore: -0.16 })).toBe("Insufficient data for an accuracy claim"));
});

function row(probability: number, outcome: boolean, cutoff = "2026-07-10T00:00:00Z"): RollingRow {
  return { cutoff, test: "strict_pre_announcement", probability, low: probability, high: probability, outcome, evidenceIds: [], features: {} as RollingRow["features"], strongestFeatures: [], baselines: { timeSinceReset: .2, milestoneProximity: .2, cooldownMilestone: .2 } };
}
