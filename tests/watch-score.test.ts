import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forecastFromEvidence } from "@/lib/forecasting";
import {
  calculateHybridLikelihood,
  type HybridResetEvent,
  type HybridSignalInput,
  type StructuredSignal,
} from "@/lib/hybrid-likelihood";
import { buildWatchScenarioTable } from "@/lib/hybrid-likelihood/scenarios";

const resetAt = "2026-07-18T03:28:22Z";
const previousResetAt = "2026-07-17T03:28:22Z";
const resetEvents: HybridResetEvent[] = [
  { id: "previous", occurredAt: previousResetAt, resetType: "full", verified: true, sourcePostId: "previous-post" },
  { id: "current", occurredAt: resetAt, resetType: "full", verified: true, sourcePostId: "reset-post" },
];

const baseForecast = (probability = .04) => ({
  ...forecastFromEvidence([], resetAt, 36, 80, 17),
  probability,
  credibleIntervalLow: Math.max(0, probability - .02),
  credibleIntervalHigh: Math.min(1, probability + .08),
});

const structured = (overrides: Partial<StructuredSignal> = {}): StructuredSignal => ({
  signalType: "general_update",
  operationalRelevance: "moderate",
  resetIntentStrength: 0,
  operatorInterventionStrength: 0,
  timeImmediacy: "low",
  sourceAuthority: "monitored_official",
  extractionConfidence: .9,
  requiresReview: false,
  uncertainties: [],
  resetConfirmed: false,
  resetType: "none",
  policyScope: "none",
  policyPersistence: "none",
  ...overrides,
});

const signal = (postId: string, postedAt: string, overrides: Partial<StructuredSignal>): HybridSignalInput => ({
  id: `event-${postId}`,
  postId,
  text: postId,
  postedAt,
  sourceUrl: `https://x.com/i/status/${postId}`,
  signal: structured(overrides),
  verificationStatus: overrides.requiresReview ? "needs_review" : "structured",
});

const policy = (postedAt = "2026-07-18T02:00:00Z") => signal("policy", postedAt, {
  signalType: "reset_policy_continuation",
  operationalRelevance: "high",
  resetIntentStrength: .9,
  timeImmediacy: "low",
  extractionConfidence: .92,
  policyScope: "ongoing",
  policyPersistence: "active",
});

describe("Reset Watch Score max-channel fusion", () => {
  it("has no fixed 30 baseline or mandatory 60 policy floor", () => {
    const source = readFileSync("src/lib/hybrid-likelihood/index.ts", "utf8");
    expect(source).not.toMatch(/30\s*\+\s*cycle/i);
    expect(source).not.toMatch(/policy(?:Regime)?ScoreFloor|policyContinuationBoost|max\([^\n]*policyFloor/i);
    const empty = calculateHybridLikelihood({ forecast: baseForecast(.02), resetEvents, signals: [], now: resetAt });
    const continued = calculateHybridLikelihood({ forecast: baseForecast(.02), resetEvents, signals: [policy()], now: resetAt });
    expect(empty.watchScore).toBe(2);
    expect(continued.watchScore).toBe(2);
    expect(continued.policyRegimeConfidence).toBe(.92);
    expect(continued.policyTimingChannel).toBe(0);
  });

  it("makes cycle maturity zero at reset and monotonic across sensitivity cutoffs", () => {
    const ratios = [0, .1, .25, .5, 1, 1.5];
    const results = ratios.map(ratio => calculateHybridLikelihood({
      forecast: baseForecast(),
      resetEvents,
      signals: [policy()],
      now: new Date(Date.parse(resetAt) + ratio * 24 * 3_600_000).toISOString(),
    }));
    expect(results[0].cycleMaturity).toBe(0);
    expect(results.every((item, index) => index === 0 || item.cycleMaturity >= results[index - 1].cycleMaturity)).toBe(true);
    expect(results.every(item => item.cycleMaturity >= 0 && item.cycleMaturity <= 1)).toBe(true);
    expect(results.every((item, index) => index === 0 || item.policyTimingChannel >= results[index - 1].policyTimingChannel)).toBe(true);
    results.forEach((item, index) => expect(item.elapsedCycleRatio).toBeCloseTo(ratios[index], 8));
  });

  it("decays the policy channel after the documented full-strength period", () => {
    const fresh = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [policy()], now: "2026-07-20T03:28:22Z" });
    const aging = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [policy()], now: "2026-07-22T03:28:22Z" });
    expect(fresh.cycleMaturity).toBe(1);
    expect(aging.cycleMaturity).toBe(1);
    expect(fresh.policyRegimeDecayFactor).toBe(1);
    expect(aging.policyRegimeDecayFactor).toBeLessThan(1);
    expect(aging.policyTimingChannel).toBeLessThan(fresh.policyTimingChannel);
  });

  it("uses only the strongest correlated signal and then the strongest independent channel", () => {
    const weakHint = signal("hint-weak", "2026-07-18T09:00:00Z", { signalType: "reset_hint", operationalRelevance: "high", resetIntentStrength: .55, timeImmediacy: "moderate", extractionConfidence: .82 });
    const strongHint = signal("hint-strong", "2026-07-18T09:10:00Z", { signalType: "reset_hint", operationalRelevance: "high", resetIntentStrength: .8, timeImmediacy: "high", extractionConfidence: .92 });
    const result = calculateHybridLikelihood({ forecast: baseForecast(.25), resetEvents, signals: [weakHint, strongHint], now: "2026-07-18T10:00:00Z" });
    expect(result.excludedSignals.find(item => item.postId === "hint-weak")?.exclusionReason).toBe("superseded_in_group");
    expect(result.strongestSignalChannel).toBeGreaterThan(result.timingChannel);
    expect(result.maxWinningChannel).toBe("live_signal");
    expect(result.watchScore).toBe(Math.round(result.strongestSignalChannel * 100));
  });

  it("applies only the strongest bounded negative penalty once", () => {
    const work = signal("work", "2026-07-18T09:00:00Z", { signalType: "operational_work_underway", operationalRelevance: "high", resetIntentStrength: .8, timeImmediacy: "high", extractionConfidence: .92 });
    const delayOne = signal("delay-1", "2026-07-18T09:10:00Z", { signalType: "negative_or_delaying_signal", operationalRelevance: "high", resetIntentStrength: .6, timeImmediacy: "high", extractionConfidence: .85 });
    const delayTwo = signal("delay-2", "2026-07-18T09:20:00Z", { signalType: "negative_or_delaying_signal", operationalRelevance: "high", resetIntentStrength: .9, timeImmediacy: "high", extractionConfidence: .95 });
    const single = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [work, delayTwo], now: "2026-07-18T10:00:00Z" });
    const duplicate = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [work, delayOne, delayTwo], now: "2026-07-18T10:00:00Z" });
    expect(duplicate.negativePenalty).toBe(single.negativePenalty);
    expect(duplicate.watchScore).toBe(single.watchScore);
    expect(duplicate.excludedSignals.find(item => item.postId === "delay-1")?.exclusionReason).toBe("superseded_in_group");
  });

  it("uses 95 only for a credible near-term commitment and resolves confirmations out of the active score", () => {
    const commitment = signal("commitment", "2026-07-18T04:00:00Z", { signalType: "near_term_reset_commitment", operationalRelevance: "high", resetIntentStrength: .9, timeImmediacy: "high", extractionConfidence: .9 });
    const imminent = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [commitment], now: "2026-07-18T05:00:00Z" });
    expect(imminent.watchScore).toBe(95);
    expect(imminent.maxWinningChannel).toBe("near_term_commitment");

    const confirmation = signal("reset-post", resetAt, { signalType: "reset_confirmation", operationalRelevance: "high", resetIntentStrength: 1, timeImmediacy: "immediate", extractionConfidence: .97, resetConfirmed: true, resetType: "full" });
    const resolved = calculateHybridLikelihood({ forecast: baseForecast(.03), resetEvents, signals: [confirmation], now: resetAt, resolvedForecastProbability: .98 });
    expect(resolved.hybridState).toBe("new_cycle");
    expect(resolved.watchScore).toBe(3);
    expect(resolved.watchScore).not.toBe(98);
    expect(resolved.activeSignals[0]).toMatchObject({ postId: "reset-post", readinessValue: 0, exclusionReason: "previous_cycle_resolved" });
  });

  it("keeps visitor counts inert and UI terminology non-probabilistic", () => {
    const baseline = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [policy()], now: "2026-07-18T09:28:22Z" });
    const visited = calculateHybridLikelihood({ forecast: baseForecast(), resetEvents, signals: [policy()], now: "2026-07-18T09:28:22Z", visitorCount: 1_000_000_000 });
    expect(visited.watchScore).toBe(baseline.watchScore);
    expect(visited.calibratedProbability).toBe(baseline.calibratedProbability);
    const hero = readFileSync("src/components/cinematic-hero.tsx", "utf8");
    expect(hero).toContain("RESET WATCH SCORE");
    expect(hero).toContain("/ 100");
    expect(hero).toContain("An operational readiness score");
    expect(hero).not.toContain("LIVE RESET LIKELIHOOD");
  });

  it("publishes deterministic scenarios that separate calibrated timing, cycle pressure, policy, and live signals", () => {
    const table = buildWatchScenarioTable();
    expect(table).toHaveLength(18);
    const justAfter = table.find(item => item.scenario === "Just after reset, active continuation policy");
    const quarterNoPolicy = table.find(item => item.scenario === "Quarter expected cycle, no policy");
    const halfNoPolicy = table.find(item => item.scenario === "Half expected cycle, no policy");
    const expectedCycle = table.find(item => item.scenario === "Expected cycle reached, active policy");
    const nearTerm = table.find(item => item.scenario === "Near-term reset commitment");
    const completed = table.find(item => item.scenario === "Completed reset");
    expect(justAfter).toMatchObject({ cyclePressureChannel: 0, policyChannel: 0, watchScore: 3, calibratedProbability: .03 });
    expect(quarterNoPolicy?.cyclePressureChannel).toBeGreaterThan(quarterNoPolicy?.timingChannel ?? 1);
    expect(halfNoPolicy?.cyclePressureChannel).toBeGreaterThan(quarterNoPolicy?.cyclePressureChannel ?? 1);
    expect(expectedCycle?.policyChannel).toBeGreaterThan(.6);
    expect(expectedCycle?.winningChannel).toBe("cycle_pressure");
    expect(nearTerm?.watchScore).toBe(95);
    expect(completed).toMatchObject({ cyclePressureChannel: 0, signalChannel: 0, watchScore: 3, calibratedProbability: .03 });
  });

  it("keeps the frozen Reset Oracle v2 artifacts byte-for-byte unchanged", () => {
    const expected = new Map([
      ["metrics.json", "5c27ee2b5756bf5bfb5b1bff554edcc7dcc1d126a8c54307d1c45c0165bb4215"],
      ["event-results.json", "1c3e1427dd1392cbcbd680e8a18cbe5f9a64882d5fbb98ff9e27565955724485"],
      ["rolling-forecasts.json", "ca19959f15afd6d9e6474909949b89fc41bf89046a789a96f24b65373121481c"],
      ["v1-v2-comparison.json", "b6f5c98a9a94a1b86bf1339d73e2e3f44cc894dc8851fb1a346a597cbfe144ce"],
    ]);
    for (const [name, digest] of expected) {
      const content = readFileSync(`artifacts/backtests/2026-06-17_2026-07-17/v2/${name}`);
      expect(createHash("sha256").update(content).digest("hex")).toBe(digest);
    }
  });
});
