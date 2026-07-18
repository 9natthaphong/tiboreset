import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { localExtract } from "@/lib/extraction/local";
import { hasExplicitCompletedOperationalReset } from "@/lib/extraction/safety";
import { forecastFromEvidence, type Evidence, type ForecastContext } from "@/lib/forecasting";
import { formatResetEventTimes } from "@/lib/format-date";
import { buildCanonicalHybridSnapshot } from "@/lib/hybrid-likelihood/canonical";
import { calculateHybridLikelihood, interpolateCyclePoints, type HybridResetEvent, type HybridSignalInput, type StructuredSignal } from "@/lib/hybrid-likelihood";

const confirmationAt = "2026-07-18T03:28:22Z";
const completedText = "Oops... I did it again. Enjoy reset usage limits for all paid users for Codex and ChatGPT Work.";
const baseForecast = { ...forecastFromEvidence([], "2026-07-18T03:00:00Z", 36, 80, 17), probability: .47, credibleIntervalLow: .2, credibleIntervalHigh: .7 };
const context: ForecastContext = { verifiedResets: [], milestoneObservations: [], historicalWindows: [], operationalSignals: [], nextPledgedMilestoneUsers: null };
const reset = (occurredAt = confirmationAt, id = "2078320950488297917"): HybridResetEvent => ({ id, occurredAt, resetType: "full", verified: true, sourcePostId: id, sourceRecordId: `${id}-source-row`, sourceUrl: `https://x.com/i/status/${id}`, sourceText: completedText });
const structured = (overrides: Partial<StructuredSignal> = {}): StructuredSignal => ({ signalType: "general_update", operationalRelevance: "moderate", resetIntentStrength: 0, operatorInterventionStrength: 0, timeImmediacy: "moderate", sourceAuthority: "monitored_official", extractionConfidence: .9, requiresReview: false, uncertainties: [], resetConfirmed: false, resetType: "none", ...overrides });
const signal = (postId: string, postedAt: string, overrides: Partial<StructuredSignal> = {}, verificationStatus: HybridSignalInput["verificationStatus"] = "structured"): HybridSignalInput => ({ id: `event-${postId}`, postId, text: postId, postedAt, sourceUrl: `https://x.com/i/status/${postId}`, signal: structured(overrides), verificationStatus });
const confirmationEvidence: Evidence = { id: "confirmation-event", postId: "2078320950488297917-source-row", postedAt: confirmationAt, excerpt: completedText, eventType: "explicit_reset_confirmation", confidence: .97, verified: true, sourceType: "official_x", url: "https://x.com/i/status/2078320950488297917", effect: 35, commitmentStrength: .98 };
const confirmationSignal = signal("2078320950488297917", confirmationAt, { signalType: "reset_confirmation", operationalRelevance: "high", resetIntentStrength: 1, timeImmediacy: "immediate", extractionConfidence: .97, resetConfirmed: true, resetType: "full" }, "verified");

describe("hybrid reset-state synchronization", () => {
  it("recognizes completed operational language without accepting future or ambiguous claims", () => {
    expect(hasExplicitCompletedOperationalReset(completedText)).toBe(true);
    expect(hasExplicitCompletedOperationalReset("We will reset usage limits tomorrow.")).toBe(false);
    expect(hasExplicitCompletedOperationalReset("Will you reset the limits?")).toBe(false);
  });

  it("closes the old cycle immediately and starts the active cycle at exactly 30", () => {
    const result = calculateHybridLikelihood({ forecast: baseForecast, resetEvents: [reset()], signals: [confirmationSignal], now: confirmationAt, resolvedForecastProbability: .98 });
    expect(result).toMatchObject({ hybridState: "new_cycle", hybridScore: 30, cycleStartAt: confirmationAt, cyclePoints: 0, historicalPoints: 0, signalPoints: 0, appliedOverride: null, eventResolutionStatus: "resolved", previousCycleFinalProbability: .98 });
    expect(result.activeSignals[0]).toMatchObject({ direction: "confirmed", appliedPoints: 0, exclusionReason: "previous_cycle_resolved" });
  });

  it("has no confirmation hold and keeps the newest verified reset as the cycle start", () => {
    const result = calculateHybridLikelihood({ forecast: baseForecast, resetEvents: [reset("2026-07-16T04:14:09.822Z", "9m"), reset()], signals: [confirmationSignal], now: "2026-07-18T03:40:00Z", resolvedForecastProbability: .98 });
    expect(result.hybridState).toBe("new_cycle");
    expect(result.hybridScore).toBe(30);
    expect(result.cycleStartAt).toBe(confirmationAt);
    expect(result.elapsedCycleHours).toBeCloseTo(11.633 / 60, 2);
  });

  it("keeps the first incomplete point of post-reset pressure at the 30 baseline", () => {
    const result = calculateHybridLikelihood({ forecast: baseForecast, resetEvents: [reset()], signals: [confirmationSignal], now: "2026-07-18T05:03:09.544Z", resolvedForecastProbability: .98 });
    expect(result.cyclePoints + result.historicalPoints).toBeGreaterThan(0);
    expect(result.cyclePoints + result.historicalPoints).toBeLessThan(1);
    expect(result.hybridScore).toBe(30);
  });

  it("excludes old-cycle operator intervention from the active score", () => {
    const intervention = signal("2078249667314528706", "2026-07-18T01:10:00Z", { signalType: "operator_intervention", operatorInterventionStrength: .62, resetIntentStrength: .15, extractionConfidence: .66 });
    const result = calculateHybridLikelihood({ forecast: baseForecast, resetEvents: [reset()], signals: [confirmationSignal, intervention], now: "2026-07-18T03:40:00Z", resolvedForecastProbability: .98 });
    expect(result.hybridScore).toBe(30);
    expect(result.excludedSignals.find(item => item.postId === intervention.postId)).toMatchObject({ bucket: "screened_out", exclusionReason: "before_cycle_start", appliedPoints: 0 });
  });

  it("recalculates the calibrated forecast from post-reset evidence instead of inheriting resolved 98", () => {
    const resolved = { id: "resolved-forecast", generatedAt: "2026-07-18T03:30:00Z", modelVersion: "reset-oracle-2.0.0", probability: .98, credibleIntervalLow: .98, credibleIntervalHigh: .98, evidencePostIds: ["2078320950488297917-source-row"] };
    const result = buildCanonicalHybridSnapshot({ cutoff: confirmationAt, evidence: [confirmationEvidence], signals: [confirmationSignal], resetEvents: [reset()], context, persistedForecast: resolved, persistedForecasts: [resolved], simulations: 80, seed: 17 });
    expect(result.hybrid).toMatchObject({ hybridState: "new_cycle", hybridScore: 30, cyclePoints: 0, historicalPoints: 0, signalPoints: 0, previousCycleFinalProbability: .98 });
    expect(result.forecast.probability).toBeLessThan(.98);
    expect(result.resolvedForecast?.probability).toBe(.98);
    expect(result.evidence).toHaveLength(0);
  });

  it("does not let a stale persisted forecast override a newer completed reset", () => {
    const stale = { id: "stale", generatedAt: "2026-07-18T03:15:00Z", modelVersion: "reset-oracle-2.0.0", probability: .47, credibleIntervalLow: .14, credibleIntervalHigh: .84, evidencePostIds: [] };
    const resolved = { id: "resolved", generatedAt: "2026-07-18T03:30:00Z", modelVersion: "reset-oracle-2.0.0", probability: .98, credibleIntervalLow: .98, credibleIntervalHigh: .98, evidencePostIds: ["2078320950488297917-source-row"] };
    const result = buildCanonicalHybridSnapshot({ cutoff: confirmationAt, evidence: [confirmationEvidence], signals: [confirmationSignal], resetEvents: [reset()], context, persistedForecast: stale, persistedForecasts: [stale, resolved], simulations: 80, seed: 17 });
    expect(result.persistedForecast?.probability).toBe(.47);
    expect(result.resolvedForecast?.probability).toBe(.98);
    expect(result.forecast.probability).toBeLessThan(.98);
    expect(result.hybrid.hybridScore).toBe(30);
  });

  it("formats the stored timestamp deterministically in UTC and Thailand time", () => {
    expect(formatResetEventTimes(confirmationAt)).toEqual({ thailand: "July 18, 2026, 10:28 ICT", utc: "July 18, 2026, 03:28 UTC" });
  });

  it("keeps cycle pressure monotonic and visitor data inert", () => {
    const points = [0, .25, .5, 1, 2, 3].map(interpolateCyclePoints);
    expect(points.every((point, index) => index === 0 || point >= points[index - 1])).toBe(true);
    expect(points.at(-1)).toBe(20);
    const baseline = calculateHybridLikelihood({ forecast: baseForecast, resetEvents: [], signals: [], now: "2026-07-18T03:40:00Z" });
    const withVisits = calculateHybridLikelihood({ forecast: baseForecast, resetEvents: [], signals: [], now: "2026-07-18T03:40:00Z", visitorCount: 99_999_999 });
    expect(withVisits.hybridScore).toBe(baseline.hybridScore);
  });

  it("classifies the stored-text pattern canonically as operator intervention", () => {
    const extraction = localExtract("@maxedapps @AnthropicAI Let me see what I can do");
    expect(extraction.event_type).toBe("general_codex_update");
    expect(extraction.signal_type).toBe("operator_intervention");
    expect(extraction.reset_confirmed).toBe(false);
  });

  it("keeps all public consumers on the canonical snapshot and removes inactive email UI", () => {
    const api = readFileSync("src/app/api/hybrid/current/route.ts", "utf8");
    const publicData = readFileSync("src/lib/public-data.ts", "utf8");
    const dataLab = readFileSync("src/lib/data-lab.ts", "utf8");
    const page = readFileSync("src/components/oracle-experience.tsx", "utf8");
    const hero = readFileSync("src/components/cinematic-hero.tsx", "utf8");
    expect(api).toContain("getPublicSnapshot");
    expect(publicData).toContain("loadCanonicalHybridSnapshot");
    expect(dataLab).toContain("loadCanonicalHybridSnapshot(client)");
    expect(page).not.toContain("SignalSubscription");
    expect(page).not.toContain("Email alerts coming soon");
    expect(hero).toContain("VIEW OFFICIAL RESET");
  });

  it("does not request additional X resources", () => {
    const adapter = readFileSync("src/lib/social/adapters.ts", "utf8");
    expect(adapter).not.toMatch(/attachments\.media_keys|media\.fields|expansions/);
    expect(adapter).toContain('"tweet.fields": "created_at,public_metrics"');
    expect(adapter).toContain("user.fields=profile_image_url,name");
  });

  it("keeps the committed v2 report and backtest artifact unchanged and available", () => {
    const metrics = JSON.parse(readFileSync("artifacts/backtests/2026-06-17_2026-07-17/v2/metrics.json", "utf8"));
    expect(metrics.version).toBe("reset-oracle-2.0.0");
    expect(metrics.strictPreAnnouncement).toBeTruthy();
  });
});
