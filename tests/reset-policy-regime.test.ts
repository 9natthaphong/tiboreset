import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { localExtract } from "@/lib/extraction/local";
import { classifyResetPolicyLanguage } from "@/lib/extraction/safety";
import { forecastFromEvidence, type ForecastContext } from "@/lib/forecasting";
import { buildCanonicalHybridSnapshot } from "@/lib/hybrid-likelihood/canonical";
import { calculateHybridLikelihood, derivePolicyRegime, policyRegimeDecayFactor, type HybridResetEvent, type HybridSignalInput, type StructuredSignal } from "@/lib/hybrid-likelihood";
import { selectCanonicalLatestSignals } from "@/lib/latest-signals-selection";

const resetAt = "2026-07-18T03:28:22Z";
const context: ForecastContext = { verifiedResets: [], milestoneObservations: [], historicalWindows: [], operationalSignals: [], nextPledgedMilestoneUsers: null };
const forecast = { ...forecastFromEvidence([], resetAt, 36, 80, 17), probability: .43, credibleIntervalLow: .11, credibleIntervalHigh: .84 };
const reset: HybridResetEvent = { id: "reset", occurredAt: resetAt, resetType: "full", verified: true, sourcePostId: "reset-post", sourceRecordId: "reset-row" };
const structured = (overrides: Partial<StructuredSignal> = {}): StructuredSignal => ({ signalType: "general_update", operationalRelevance: "moderate", resetIntentStrength: 0, operatorInterventionStrength: 0, timeImmediacy: "low", sourceAuthority: "monitored_official", extractionConfidence: .9, requiresReview: false, uncertainties: [], resetConfirmed: false, resetType: "none", policyScope: "none", policyPersistence: "none", ...overrides });
const signal = (postId: string, postedAt: string, overrides: Partial<StructuredSignal>): HybridSignalInput => ({ id: `event-${postId}`, postId, text: postId, postedAt, sourceUrl: `https://x.com/i/status/${postId}`, signal: structured(overrides), verificationStatus: overrides.requiresReview ? "needs_review" : "structured" });
const policySignal = (postId = "policy", postedAt = "2026-07-18T02:00:00Z") => signal(postId, postedAt, { signalType: "reset_policy_continuation", operationalRelevance: "high", resetIntentStrength: .9, timeImmediacy: "low", extractionConfidence: .92, policyScope: "ongoing", policyPersistence: "active" });

describe("reset policy language screening", () => {
  it.each(["reset soon", "The resets will continue", "We are resetting limits again"])("detects reset morphology: %s", text => expect(localExtract(text).is_relevant).toBe(true));

  it("classifies a clear continuation as high-relevance ongoing policy without confirmation or timing override", () => {
    const extraction = localExtract("@CastAsHuman Don’t really mind it! The resets will continue");
    expect(extraction).toMatchObject({ is_relevant: true, event_type: "general_codex_update", signal_type: "reset_policy_continuation", operational_relevance: "high", time_immediacy: "low", policy_scope: "ongoing", policy_persistence: "active", requires_review: false, reset_confirmed: false });
    expect(extraction.reset_intent_strength).toBeGreaterThanOrEqual(.8);
    expect(extraction.extraction_confidence).toBeGreaterThanOrEqual(.85);
  });

  it("keeps questions and uncertainty review-blocked with zero automatic impact", () => {
    for (const text of ["Will the resets continue?", "I don't know whether resets will continue."]) {
      const extraction = localExtract(text);
      expect(extraction.signal_type).toBe("reset_policy_continuation");
      expect(extraction.requires_review).toBe(true);
      expect(extraction.reset_confirmed).toBe(false);
    }
  });

  it("treats an explicit cancellation as policy withdrawal", () => {
    expect(classifyResetPolicyLanguage("No more resets.")).toBe("withdrawal");
    expect(localExtract("No more resets.")).toMatchObject({ signal_type: "negative_or_delaying_signal", policy_persistence: "withdrawn", requires_review: false });
  });
});

describe("long-lived reset policy regime", () => {
  it("activates a fresh official regime near a 60 floor and survives a reset boundary", () => {
    const result = calculateHybridLikelihood({ forecast, resetEvents: [reset], signals: [policySignal()], now: resetAt });
    expect(result).toMatchObject({ hybridModelVersion: "sacred-likelihood-1.1.0", hybridState: "new_cycle", policyRegimeState: "reset_policy_active", policyRegimeSourcePostId: "policy", policyContinuationBoost: 30, policyRegimeScoreFloor: 60, policyRegimeCap: 80, signalPoints: 0 });
    expect(result.hybridScore).toBe(60);
    expect(result.activeSignals.find(item => item.postId === "policy")).toMatchObject({ bucket: "forecast_moving", appliedPoints: 0 });
  });

  it("does not let ordinary transient evidence survive the reset boundary", () => {
    const transient = signal("hint", "2026-07-18T02:30:00Z", { signalType: "reset_hint", operationalRelevance: "high", resetIntentStrength: .7, extractionConfidence: .9 });
    const result = calculateHybridLikelihood({ forecast, resetEvents: [reset], signals: [policySignal(), transient], now: resetAt });
    expect(result.excludedSignals.find(item => item.postId === "hint")).toMatchObject({ exclusionReason: "before_cycle_start", appliedPoints: 0 });
    expect(result.hybridScore).toBe(60);
  });

  it("does not stack repeated policy statements and lets a newer statement refresh or withdraw the regime", () => {
    const older = policySignal("older", "2026-07-17T00:00:00Z");
    const newer = policySignal("newer", "2026-07-18T02:30:00Z");
    expect(derivePolicyRegime([older, newer], resetAt).sourcePostId).toBe("newer");
    const withdrawal = signal("withdrawal", "2026-07-18T03:00:00Z", { signalType: "negative_or_delaying_signal", operationalRelevance: "high", resetIntentStrength: 1, policyScope: "ongoing", policyPersistence: "withdrawn" });
    expect(derivePolicyRegime([older, newer, withdrawal], resetAt)).toMatchObject({ state: "reset_policy_withdrawn", sourcePostId: "withdrawal", boost: 0 });
  });

  it("moves superseded continuation statements out of the active signal set", () => {
    const older = policySignal("older", "2026-07-17T00:00:00Z");
    const newer = policySignal("newer", "2026-07-18T02:30:00Z");
    const result = calculateHybridLikelihood({ forecast, resetEvents: [reset], signals: [older, newer], now: resetAt });
    expect(result.activeSignals.find(item => item.postId === "newer")).toBeDefined();
    expect(result.excludedSignals.find(item => item.postId === "older")).toMatchObject({ exclusionReason: "superseded_in_group", appliedPoints: 0 });
  });

  it("holds full strength for 72 hours, then decays and expires after seven days", () => {
    expect(policyRegimeDecayFactor(72)).toBe(1);
    expect(policyRegimeDecayFactor(96)).toBeLessThan(1);
    expect(policyRegimeDecayFactor(96)).toBeGreaterThan(0);
    expect(policyRegimeDecayFactor(168)).toBe(0);
  });

  it("uses a floor instead of adding 30 and enforces the policy-only cap", () => {
    const highForecast = { ...forecast, probability: .95 };
    const result = calculateHybridLikelihood({ forecast: highForecast, resetEvents: [], signals: [policySignal()], now: "2026-07-18T04:00:00Z" });
    expect(result.hybridScore).toBeLessThanOrEqual(80);
    expect(result.policyRegimeEffectivePoints).toBeLessThan(30);
  });

  it("allows a credible near-term commitment to produce 95 but continuation alone never does", () => {
    const continuation = calculateHybridLikelihood({ forecast, resetEvents: [], signals: [policySignal()], now: "2026-07-18T04:00:00Z" });
    const commitment = signal("commitment", "2026-07-18T03:30:00Z", { signalType: "near_term_reset_commitment", operationalRelevance: "high", resetIntentStrength: .9, timeImmediacy: "high", extractionConfidence: .9 });
    const imminent = calculateHybridLikelihood({ forecast, resetEvents: [], signals: [policySignal(), commitment], now: "2026-07-18T04:00:00Z" });
    expect(continuation.hybridScore).toBeLessThanOrEqual(80);
    expect(imminent.hybridScore).toBe(95);
  });

  it("maps policy evidence through the calibrated model without a fixed 30-point probability addition", () => {
    const policy = policySignal();
    const evidence = { id: policy.id, postId: "policy-row", postedAt: policy.postedAt, excerpt: "The resets will continue", eventType: "general_codex_update" as const, confidence: .92, verified: true, sourceType: "official_x" as const, url: policy.sourceUrl, effect: 0, commitmentStrength: .85 };
    const result = buildCanonicalHybridSnapshot({ cutoff: resetAt, evidence: [evidence], signals: [policy], resetEvents: [reset], context, simulations: 80, seed: 17 });
    expect(result.hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints).toBeGreaterThan(0);
    expect(result.hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints).toBeLessThan(30);
  });

  it("keeps visitor counts out of both metrics", () => {
    const baseline = calculateHybridLikelihood({ forecast, resetEvents: [], signals: [policySignal()], now: resetAt });
    const visited = calculateHybridLikelihood({ forecast, resetEvents: [], signals: [policySignal()], now: resetAt, visitorCount: 10_000_000 });
    expect(visited.hybridScore).toBe(baseline.hybridScore);
    expect(visited.calibratedProbability).toBe(baseline.calibratedProbability);
  });
});

describe("canonical Latest Signals selection", () => {
  it("keeps active policy and resolved posts despite newer screened posts and deduplicates IDs", () => {
    const posts = [
      ...Array.from({ length: 25 }, (_, index) => ({ platform_post_id: `screened-${index}`, posted_at: `2026-07-19T${String(23 - (index % 20)).padStart(2, "0")}:00:00Z` })),
      { platform_post_id: "policy", posted_at: "2026-07-18T02:00:00Z" },
      { platform_post_id: "reset-post", posted_at: resetAt },
    ];
    const selected = selectCanonicalLatestSignals({ posts, activePostIds: ["policy", "reset-post", "policy"], policySourcePostId: "policy", resolvedPostId: "reset-post", limit: 20 });
    expect(selected.some(item => item.platform_post_id === "policy")).toBe(true);
    expect(selected.some(item => item.platform_post_id === "reset-post")).toBe(true);
    expect(new Set(selected.map(item => item.platform_post_id)).size).toBe(selected.length);
  });

  it("does not change X resource requests or the frozen v2 artifact", () => {
    const adapter = readFileSync("src/lib/social/adapters.ts", "utf8");
    expect(adapter).not.toMatch(/attachments\.media_keys|media\.fields|expansions/);
    const metrics = JSON.parse(readFileSync("artifacts/backtests/2026-06-17_2026-07-17/v2/metrics.json", "utf8"));
    expect(metrics.version).toBe("reset-oracle-2.0.0");
  });
});
