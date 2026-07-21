import type { HybridSignalInput, SignalContribution, StructuredSignalType } from "./types";

const HOUR = 3_600_000;

// Expert-prior semantic ceilings. They bound readiness; they are not fitted
// probabilities and are never summed across posts.
const semanticCeilings: Record<StructuredSignalType, number> = {
  irrelevant: 0,
  general_update: .15,
  operator_intervention: .35,
  operational_work_underway: .75,
  reset_hint: .8,
  milestone_progress: .5,
  milestone_commitment: .92,
  limit_policy_change: .65,
  reset_policy_continuation: 0,
  near_term_reset_commitment: .95,
  reset_confirmation: 0,
  negative_or_delaying_signal: .5,
};

const relevanceFactor = { none: 0, low: .4, moderate: .72, high: 1 } as const;
const immediacyFactor = { none: 0, low: .35, moderate: .65, high: .9, immediate: 1 } as const;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function signalRecencyFactor(postedAt: string, cutoff: string): number {
  const age = (Date.parse(cutoff) - Date.parse(postedAt)) / HOUR;
  if (!Number.isFinite(age) || age < 0) return 0;
  if (age <= 6) return 1;
  if (age <= 12) return 1 - ((age - 6) / 6) * .25;
  if (age <= 24) return .75 - ((age - 12) / 12) * .45;
  if (age <= 36) return .3 - ((age - 24) / 12) * .3;
  return 0;
}

const groupFor = (type: StructuredSignalType) => type === "negative_or_delaying_signal" ? "negative_evidence" : type;

export function structuredSignalReadiness(signal: HybridSignalInput, recencyFactor: number): number {
  const { signal: evidence } = signal;
  if (evidence.requiresReview || signal.verificationStatus === "needs_review" || evidence.signalType === "reset_policy_continuation" || evidence.signalType === "reset_confirmation" || evidence.signalType === "irrelevant" || evidence.signalType === "negative_or_delaying_signal") return 0;
  const ceiling = semanticCeilings[evidence.signalType];
  const authority = evidence.sourceAuthority === "monitored_official" ? 1 : evidence.sourceAuthority === "official" ? .9 : .65;
  const relevanceAndTiming = .55 + .25 * relevanceFactor[evidence.operationalRelevance] + .2 * immediacyFactor[evidence.timeImmediacy];
  const strength = evidence.signalType === "operator_intervention" ? evidence.operatorInterventionStrength : evidence.resetIntentStrength;
  const strengthFactor = .65 + .35 * clamp01(strength);
  return clamp01(ceiling * authority * clamp01(evidence.extractionConfidence) * clamp01(recencyFactor) * relevanceAndTiming * strengthFactor);
}

function negativeEvidencePenalty(signal: HybridSignalInput, recencyFactor: number): number {
  const evidence = signal.signal;
  if (evidence.signalType !== "negative_or_delaying_signal" || evidence.requiresReview || signal.verificationStatus === "needs_review") return 0;
  const authority = evidence.sourceAuthority === "monitored_official" ? 1 : evidence.sourceAuthority === "official" ? .9 : .65;
  const relevanceAndTiming = .55 + .25 * relevanceFactor[evidence.operationalRelevance] + .2 * immediacyFactor[evidence.timeImmediacy];
  const strengthFactor = .65 + .35 * clamp01(evidence.resetIntentStrength);
  return clamp01(semanticCeilings.negative_or_delaying_signal * authority * clamp01(evidence.extractionConfidence) * clamp01(recencyFactor) * relevanceAndTiming * strengthFactor);
}

function contributionFor(signal: HybridSignalInput, cutoff: string, cycleStartAt: string | null): SignalContribution {
  const type = signal.signal.signalType;
  const recency = signalRecencyFactor(signal.postedAt, cutoff);
  const confidence = clamp01(signal.signal.extractionConfidence);
  const common = {
    signalId: signal.id,
    postId: signal.postId,
    signalType: type,
    semanticGroup: groupFor(type),
    semanticCeiling: semanticCeilings[type],
    confidenceFactor: confidence,
    recencyFactor: recency,
    readinessValue: 0,
    negativePenalty: 0,
    watchCounterfactualDeltaPoints: null,
  };
  if (signal.signal.requiresReview || signal.verificationStatus === "needs_review") return { ...common, direction: "contextual", bucket: "screened_out", exclusionReason: "requires_review", reason: "Review-blocked evidence cannot change the Reset Watch Score." };
  if (type === "reset_policy_continuation" && signal.signal.policyPersistence === "active") return { ...common, direction: "raised", bucket: "forecast_moving", exclusionReason: null, reason: "This ongoing official statement affects the policy-timing channel; it is not a flat score addition." };
  if (cycleStartAt && Date.parse(signal.postedAt) <= Date.parse(cycleStartAt)) return { ...common, direction: "contextual", bucket: "screened_out", exclusionReason: "before_cycle_start", reason: "Evidence predates the active reset cycle." };
  if (type === "irrelevant") return { ...common, direction: "contextual", bucket: "screened_out", exclusionReason: "irrelevant", reason: "The post was screened as unrelated." };
  if (recency <= 0) return { ...common, direction: "contextual", bucket: "screened_out", exclusionReason: "expired", reason: "The transient signal is outside the 36-hour active window." };
  if (type === "reset_confirmation") return { ...common, direction: "confirmed", bucket: "screened_out", exclusionReason: "previous_cycle_resolved", reason: "The completed reset closed the previous cycle and does not score the next cycle." };
  if (type === "negative_or_delaying_signal") {
    const penalty = negativeEvidencePenalty(signal, recency);
    return { ...common, direction: penalty > 0 ? "lowered" : "contextual", negativePenalty: penalty, bucket: penalty > 0 ? "forecast_moving" : "screened_out", exclusionReason: null, reason: "The strongest eligible delaying signal applies one bounded multiplicative penalty." };
  }
  const readinessValue = structuredSignalReadiness(signal, recency);
  return { ...common, direction: readinessValue > 0 ? "raised" : "contextual", readinessValue, bucket: readinessValue > 0 ? "forecast_moving" : "screened_out", exclusionReason: readinessValue > 0 ? null : "irrelevant", reason: readinessValue > 0 ? "Structured evidence supplies a bounded readiness value after authority, confidence, timing, strength, and recency adjustment." : "The structured signal has no eligible readiness effect." };
}

export function scoreSignals(signals: HybridSignalInput[], cutoff: string, cycleStartAt: string | null) {
  const contributions = signals.map(item => contributionFor(item, cutoff, cycleStartAt));
  const strongest = new Map<string, SignalContribution>();
  for (const contribution of contributions.filter(item => item.bucket === "forecast_moving" && item.exclusionReason == null && (item.readinessValue > 0 || item.negativePenalty > 0))) {
    const value = Math.max(contribution.readinessValue, contribution.negativePenalty);
    const existing = strongest.get(contribution.semanticGroup);
    if (!existing || value > Math.max(existing.readinessValue, existing.negativePenalty)) strongest.set(contribution.semanticGroup, contribution);
  }
  for (const contribution of contributions) {
    if (contribution.exclusionReason == null && (contribution.readinessValue > 0 || contribution.negativePenalty > 0) && strongest.get(contribution.semanticGroup) !== contribution) {
      contribution.readinessValue = 0;
      contribution.negativePenalty = 0;
      contribution.bucket = "screened_out";
      contribution.direction = "contextual";
      contribution.exclusionReason = "superseded_in_group";
      contribution.reason = "A stronger active signal already represents this semantic group.";
    }
  }
  const eligible = [...strongest.values()];
  const strongestSignalChannel = eligible.reduce((maximum, item) => Math.max(maximum, item.readinessValue), 0);
  const negativePenalty = eligible.reduce((maximum, item) => Math.max(maximum, item.negativePenalty), 0);
  return { strongestSignalChannel, negativePenalty, contributions };
}

export const SIGNAL_READINESS_CEILINGS = semanticCeilings;
