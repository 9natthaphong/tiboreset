import { describe, expect, it } from "vitest";
import { localExtract } from "@/lib/extraction/local";
import { deterministicForecastImpact } from "@/lib/ingestion";
import { forecastFromEvidence, forecastFromEvidenceV1, type Features } from "@/lib/forecasting";
import { combineIndependentRisks, conditionalLogNormalProbability, estimateMilestoneArrival, mixtureConditionalProbability, policyForecast, policyMonteCarlo, resetGivenMilestonePosterior, type MilestoneObservation } from "@/lib/forecasting/v2";

const observation = (users: number, announcedAt: string, resetType: MilestoneObservation["resetType"] = "full"): MilestoneObservation => ({ users, announcedAt, resetType });
const history: MilestoneObservation[] = [
  observation(3_000_000, "2026-04-07T23:13:48Z"), observation(4_000_000, "2026-04-21T14:52:11Z"), observation(5_000_000, "2026-05-31T05:59:10Z", "scheduled"),
  observation(6_000_000, "2026-07-12T17:59:57Z"), observation(7_000_000, "2026-07-13T18:29:31Z", "banked"), observation(8_000_000, "2026-07-14T19:34:54Z"), observation(9_000_000, "2026-07-16T04:14:09Z"),
];

describe("Reset Oracle v2 policy model", () => {
  it("preserves v1 for comparison while selecting v2 for new forecasts", () => {
    expect(forecastFromEvidenceV1([], "2026-07-15T00:00:00Z", 36, 50, 1).modelVersion).toBe("reset-oracle-1.1.0");
    expect(forecastFromEvidence([], "2026-07-15T00:00:00Z", 36, 50, 1).modelVersion).toBe("reset-oracle-2.0.0");
  });

  it("uses conditional survival rather than an unconditional interval probability", () => {
    const probability = conditionalLogNormalProbability(24, 36, 48, .5);
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeLessThan(1);
    expect(mixtureConditionalProbability({ elapsedHours: 24, horizonHours: 36, longMedianHours: 600, recentMedianHours: 25, longSigma: .5, recentSigma: .7, regimeWeight: .86 })).toBeGreaterThan(.3);
  });

  it("detects a rapid trailing milestone regime using only completed intervals", () => {
    const before7M = estimateMilestoneArrival(history, "2026-07-13T12:00:00Z", 36);
    const after7M = estimateMilestoneArrival(history, "2026-07-14T00:00:00Z", 36);
    expect(before7M.recentIntervalsHours).toHaveLength(0);
    expect(after7M.recentIntervalsHours).toHaveLength(1);
    expect(after7M.recentMedianHours).toBeLessThan(after7M.longTermMedianHours!);
  });

  it("replaces the legacy 9M-over-10M ratio with milestone-arrival pressure", () => {
    const result = policyForecast({ evidence: [], milestones: history, cutoff: "2026-07-16T18:00:00Z", count: 100, seed: 3 });
    expect(result.baselineFeatures.milestone_proximity).toBe(.9);
    expect(result.features.milestone_proximity).toBe(0);
    expect(result.featureOrigins.milestone_proximity).toBe("unavailable");
    expect(result.interval.conditionalArrivalProbability).toBeGreaterThan(.5);
  });

  it("does not let discretionary cooldown suppress the policy branch", () => {
    const interval = estimateMilestoneArrival(history, "2026-07-15T00:00:00Z", 36);
    const posterior = resetGivenMilestonePosterior(history.slice(0, 6));
    const features = emptyFeatures();
    const first = policyMonteCarlo({ features: { ...features, recent_reset_suppression: 0 }, interval, posterior, horizonHours: 36, policyActive: true, arrivalEvidenceBoost: 0, count: 200, seed: 7 });
    const second = policyMonteCarlo({ features: { ...features, recent_reset_suppression: 1 }, interval, posterior, horizonHours: 36, policyActive: true, arrivalEvidenceBoost: 0, count: 200, seed: 7 });
    expect(second.policy).toEqual(first.policy);
    expect(second.discretionary.median).toBeLessThan(first.discretionary.median);
  });

  it("fulfills the policy at 10M without inventing an 11M target", () => {
    const result = policyForecast({ evidence: [], milestones: [...history, observation(10_000_000, "2026-07-17T12:00:00Z")], cutoff: "2026-07-18T00:00:00Z", count: 100, seed: 1 });
    expect(result.policyStatus).toBe("fulfilled");
    expect(result.nextTargetUsers).toBeNull();
    expect(result.policyProbability).toBe(0);
  });

  it("updates a Beta(1,1) posterior by reset type", () => {
    const posterior = resetGivenMilestonePosterior([observation(3_000_000, "2026-01-01T00:00:00Z"), observation(4_000_000, "2026-02-01T00:00:00Z", "banked"), observation(5_000_000, "2026-03-01T00:00:00Z", "scheduled"), observation(6_000_000, "2026-04-01T00:00:00Z", "announcement_only")]);
    expect(posterior).toMatchObject({ successes: 3, failures: 1, alpha: 4, beta: 2 });
    expect(posterior.mean).toBeCloseTo(2 / 3);
  });

  it("combines independent branches without adding percentage points", () => expect(combineIndependentRisks(.6, .2)).toBeCloseTo(.68));

  it("applies a verified confirmation override only to the immediate forecast window", () => {
    const confirmation = [{
      id: "confirmed",
      postId: "confirmed-post",
      postedAt: "2026-07-16T04:14:09Z",
      excerpt: "Usage limits have been reset.",
      eventType: "explicit_reset_confirmation" as const,
      confidence: 1,
      verified: true,
      sourceType: "official_x" as const,
      url: "https://x.com/i/status/confirmed",
      effect: 0,
    }];
    const immediate = policyForecast({ evidence: confirmation, milestones: history, cutoff: "2026-07-16T05:00:00Z", count: 100, seed: 4 });
    const expired = policyForecast({ evidence: confirmation, milestones: history, cutoff: "2026-07-16T12:30:00Z", count: 100, seed: 4 });
    expect(immediate.probability).toBeGreaterThanOrEqual(.98);
    expect(expired.probability).toBeLessThan(.98);
  });

  it("keeps reset-button jokes at zero impact", () => expect(deterministicForecastImpact(localExtract("I stole their reset button. Youre welcome Codex."))).toBe(0));

  it("does not use a milestone interval before it completes", () => {
    expect(estimateMilestoneArrival(history, "2026-07-13T12:00:00Z", 36).intervalsHours).toHaveLength(3);
    expect(estimateMilestoneArrival(history, "2026-07-14T00:00:00Z", 36).intervalsHours).toHaveLength(4);
  });

  it("produces deterministic seeded branch simulations", () => {
    const input = { features: emptyFeatures(), interval: estimateMilestoneArrival(history, "2026-07-15T00:00:00Z", 36), posterior: resetGivenMilestonePosterior(history.slice(0, 6)), horizonHours: 36, policyActive: true, arrivalEvidenceBoost: 0, count: 200, seed: 42 };
    expect(policyMonteCarlo(input)).toEqual(policyMonteCarlo(input));
  });
});

function emptyFeatures(): Features { return { explicit_reset_confirmation: 0, explicit_reset_hint: 0, public_commitment_strength: 0, milestone_proximity: 0, milestone_velocity: 0, time_since_last_reset: 0, recent_reset_suppression: 0, usage_incident_strength: 0, capacity_concern: 0, promotional_signal: 0, product_launch_signal: 0, community_poll_signal: 0, historical_analog_success_rate: 0, historical_analog_similarity: 0, signal_frequency_change: 0, evidence_recency: 0, source_reliability: 0, unresolved_ambiguity_penalty: 0 }; }
