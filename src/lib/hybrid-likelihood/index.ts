import { estimateCycle } from "./cycle";
import { scoreSignals } from "./signals";
import { derivePolicyRegime } from "./policy-regime";
import type { HybridLikelihood, HybridLikelihoodInput, HybridResetEvent } from "./types";

export const HYBRID_MODEL_VERSION = "sacred-likelihood-1.1.0" as const;
const HOUR = 3_600_000;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (value: number) => {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
};

function latestVerifiedReset(events: HybridResetEvent[], cutoff: string): HybridResetEvent | null {
  const time = Date.parse(cutoff);
  return events
    .filter(item => item.verified && (item.resetType === "full" || item.resetType === "banked") && Date.parse(item.occurredAt) <= time)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null;
}

export function calculateHybridLikelihood(input: HybridLikelihoodInput): HybridLikelihood {
  const latestReset = latestVerifiedReset(input.resetEvents, input.now);
  const cycle = estimateCycle(input.resetEvents, input.now);
  const scored = scoreSignals(input.signals, input.now, cycle.cycleStartAt);
  const policyRegime = derivePolicyRegime(input.signals, input.now);
  for (const contribution of scored.contributions) {
    if (contribution.signalType !== "reset_policy_continuation" || contribution.postId === policyRegime.sourcePostId) continue;
    contribution.bucket = "screened_out";
    contribution.direction = "contextual";
    contribution.appliedPoints = 0;
    contribution.exclusionReason = "superseded_in_group";
    contribution.reason = "A newer or stronger official reset-policy statement is the active regime source.";
  }
  if (latestReset?.sourcePostId) {
    const confirmationContribution = scored.contributions.find(item => item.postId === latestReset.sourcePostId && item.signalType === "reset_confirmation");
    if (confirmationContribution) {
      confirmationContribution.bucket = "forecast_moving";
      confirmationContribution.direction = "confirmed";
      confirmationContribution.appliedPoints = 0;
      confirmationContribution.exclusionReason = "previous_cycle_resolved";
      confirmationContribution.reason = "The official completed reset resolved the previous cycle; it contributes zero to the active next-reset score.";
    }
  }
  const credibleCommitment = input.signals.some(item => item.signal.signalType === "near_term_reset_commitment" && !item.signal.requiresReview && item.signal.resetIntentStrength >= .8 && item.signal.extractionConfidence >= .85 && Date.parse(item.postedAt) > Date.parse(input.now) - 36 * HOUR && (!cycle.cycleStartAt || Date.parse(item.postedAt) > Date.parse(cycle.cycleStartAt)));
  const credibleTimingEvidence = input.signals.some(item => !item.signal.requiresReview && item.verificationStatus !== "needs_review" && (item.signal.signalType === "operational_work_underway" && (item.signal.timeImmediacy === "high" || item.signal.timeImmediacy === "immediate") || item.signal.signalType === "milestone_commitment" || item.signal.signalType === "near_term_reset_commitment") && (!cycle.cycleStartAt || Date.parse(item.postedAt) > Date.parse(cycle.cycleStartAt)));
  const activeSignals = scored.contributions.filter(item => item.bucket === "forecast_moving");
  const excludedSignals = scored.contributions.filter(item => item.bucket === "screened_out");
  const historicalGate = cycle.cycleStartAt ? smoothstep(cycle.effectiveElapsedHours / Math.max(1, cycle.expectedCycleHours * .5)) : 1;
  const historicalPoints = clamp(input.forecast.probability * 25 * historicalGate, 0, 25);
  if (credibleCommitment) {
    return { ...cycle, hybridModelVersion: HYBRID_MODEL_VERSION, hybridScore: 95, hybridState: "imminent_commitment", historicalPoints, signalPoints: scored.signalPoints, negativePoints: scored.negativePoints, appliedOverride: "near_term_reset_commitment", calculatedAt: input.now, evidenceCutoff: input.now, calibratedProbability: input.forecast.probability, credibleInterval: [input.forecast.credibleIntervalLow, input.forecast.credibleIntervalHigh], calibratedModelVersion: input.forecast.modelVersion, persistedHybridScore: null, confirmation: latestReset, previousCycleResolvedAt: latestReset?.occurredAt ?? null, previousCycleFinalProbability: input.resolvedForecastProbability ?? null, eventResolutionStatus: latestReset ? "resolved" : "none", activeSignals, excludedSignals, policyRegimeState: policyRegime.state, policyRegimeSourcePostId: policyRegime.sourcePostId, policyRegimeActivatedAt: policyRegime.activatedAt, policyRegimeExpiresAt: policyRegime.expiresAt, policyRegimeConfidence: policyRegime.confidence, policyRegimeReason: policyRegime.reason, policyRegimeScoreFloor: policyRegime.scoreFloor, policyRegimeCap: policyRegime.cap, policyContinuationBoost: policyRegime.boost, policyRegimeEffectivePoints: 0, policyRegimeAgeHours: policyRegime.ageHours, policyRegimeDecayFactor: policyRegime.decayFactor, policyRegimeCalibratedCounterfactualDeltaPercentagePoints: null };
  }
  const raw = 30 + cycle.cyclePoints + historicalPoints + scored.signalPoints - scored.negativePoints;
  const atNewCycleBoundary = cycle.cycleStartAt != null && cycle.effectiveElapsedHours === 0;
  const scoreBeforePolicy = atNewCycleBoundary ? 30 : raw;
  const scoreBeforeTimingCap = policyRegime.state === "reset_policy_active" ? Math.max(scoreBeforePolicy, policyRegime.scoreFloor) : scoreBeforePolicy;
  const maximum = policyRegime.state === "reset_policy_active" && !credibleTimingEvidence ? policyRegime.cap : 94;
  const hybridScore = Math.floor(clamp(scoreBeforeTimingCap, 30, maximum));
  return {
    ...cycle,
    hybridModelVersion: HYBRID_MODEL_VERSION,
    // Operational scores are whole-number bands. Flooring avoids presenting a
    // one-point rise before a full point of post-reset pressure has accumulated.
    hybridScore,
    hybridState: cycle.cycleStartAt ? "new_cycle" : "normal_cycle",
    historicalPoints,
    signalPoints: atNewCycleBoundary ? 0 : scored.signalPoints,
    negativePoints: atNewCycleBoundary ? 0 : scored.negativePoints,
    appliedOverride: null,
    calculatedAt: input.now,
    evidenceCutoff: input.now,
    calibratedProbability: input.forecast.probability,
    credibleInterval: [input.forecast.credibleIntervalLow, input.forecast.credibleIntervalHigh],
    calibratedModelVersion: input.forecast.modelVersion,
    persistedHybridScore: null,
    confirmation: latestReset,
    previousCycleResolvedAt: latestReset?.occurredAt ?? null,
    previousCycleFinalProbability: input.resolvedForecastProbability ?? null,
    eventResolutionStatus: latestReset ? "resolved" : "none",
    activeSignals,
    excludedSignals,
    policyRegimeState: policyRegime.state,
    policyRegimeSourcePostId: policyRegime.sourcePostId,
    policyRegimeActivatedAt: policyRegime.activatedAt,
    policyRegimeExpiresAt: policyRegime.expiresAt,
    policyRegimeConfidence: policyRegime.confidence,
    policyRegimeReason: policyRegime.reason,
    policyRegimeScoreFloor: policyRegime.scoreFloor,
    policyRegimeCap: policyRegime.cap,
    policyContinuationBoost: policyRegime.boost,
    policyRegimeEffectivePoints: Math.max(0, hybridScore - Math.floor(clamp(scoreBeforePolicy, 30, maximum))),
    policyRegimeAgeHours: policyRegime.ageHours,
    policyRegimeDecayFactor: policyRegime.decayFactor,
    policyRegimeCalibratedCounterfactualDeltaPercentagePoints: null,
  };
}

export * from "./types";
export * from "./cycle";
export * from "./signals";
export * from "./policy-regime";
