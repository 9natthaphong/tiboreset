import type { HybridSignalInput, SignalContribution, StructuredSignalType } from "./types";

const HOUR = 3_600_000;
const basePoints: Record<StructuredSignalType, number> = {
  irrelevant: 0,
  general_update: 1,
  operator_intervention: 8,
  operational_work_underway: 13,
  reset_hint: 16,
  milestone_progress: 6,
  milestone_commitment: 20,
  limit_policy_change: 12,
  reset_policy_continuation: 0,
  near_term_reset_commitment: 25,
  reset_confirmation: 0,
  negative_or_delaying_signal: -10,
};

const relevanceFactor = { none: 0, low: .55, moderate: .82, high: 1 } as const;
const immediacyFactor = { none: .4, low: .6, moderate: .8, high: 1, immediate: 1 } as const;

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

function contributionFor(signal: HybridSignalInput, cutoff: string, cycleStartAt: string | null): SignalContribution {
  const type = signal.signal.signalType;
  const raw = basePoints[type];
  const recency = signalRecencyFactor(signal.postedAt, cutoff);
  const confidence = Math.max(0, Math.min(1, signal.signal.extractionConfidence));
  const common = {
    signalId: signal.id,
    postId: signal.postId,
    signalType: type,
    semanticGroup: groupFor(type),
    rawPoints: raw,
    confidenceFactor: confidence,
    recencyFactor: recency,
  };
  if (signal.signal.requiresReview || signal.verificationStatus === "needs_review") return { ...common, direction: "contextual", appliedPoints: 0, bucket: "screened_out", exclusionReason: "requires_review", reason: "Review-blocked evidence cannot change the active score." };
  if (type === "reset_policy_continuation" && signal.signal.policyPersistence === "active") return { ...common, direction: "raised", appliedPoints: 0, bucket: "forecast_moving", exclusionReason: null, reason: "An ongoing official reset-policy regime is scored as a persistent floor, not a transient point addition." };
  if (cycleStartAt && Date.parse(signal.postedAt) <= Date.parse(cycleStartAt)) return { ...common, direction: "contextual", appliedPoints: 0, bucket: "screened_out", exclusionReason: "before_cycle_start", reason: "Evidence predates the active reset cycle." };
  if (type === "irrelevant") return { ...common, direction: "contextual", appliedPoints: 0, bucket: "screened_out", exclusionReason: "irrelevant", reason: "The post was screened as unrelated." };
  if (recency <= 0) return { ...common, direction: "contextual", appliedPoints: 0, bucket: "screened_out", exclusionReason: "expired", reason: "The signal is outside the 36-hour active window." };
  if (type === "reset_confirmation") return { ...common, direction: "confirmed", appliedPoints: 0, bucket: "screened_out", exclusionReason: "previous_cycle_resolved", reason: "The completed reset closed the previous cycle and does not score the next cycle." };
  const authority = signal.signal.sourceAuthority === "monitored_official" ? 1 : signal.signal.sourceAuthority === "official" ? .9 : .65;
  const strength = type === "operator_intervention" ? Math.max(.55, signal.signal.operatorInterventionStrength) : Math.max(.45, signal.signal.resetIntentStrength);
  const applied = raw * relevanceFactor[signal.signal.operationalRelevance] * immediacyFactor[signal.signal.timeImmediacy] * confidence * authority * (.55 + .45 * strength) * recency;
  return {
    ...common,
    direction: applied < 0 ? "lowered" : applied > 0 ? "raised" : "contextual",
    appliedPoints: applied,
    bucket: applied === 0 ? "screened_out" : "forecast_moving",
    exclusionReason: null,
    reason: applied < 0 ? "Verified delaying evidence lowers the operational score." : "Structured official evidence contributes after confidence and recency adjustment.",
  };
}

export function scoreSignals(signals: HybridSignalInput[], cutoff: string, cycleStartAt: string | null) {
  const contributions = signals.map(item => contributionFor(item, cutoff, cycleStartAt));
  const strongest = new Map<string, SignalContribution>();
  for (const contribution of contributions.filter(item => item.bucket === "forecast_moving" && item.exclusionReason == null)) {
    const existing = strongest.get(contribution.semanticGroup);
    if (!existing || Math.abs(contribution.appliedPoints) > Math.abs(existing.appliedPoints)) strongest.set(contribution.semanticGroup, contribution);
  }
  for (const contribution of contributions) {
    if (contribution.exclusionReason == null && contribution.appliedPoints !== 0 && strongest.get(contribution.semanticGroup) !== contribution) {
      contribution.appliedPoints = 0;
      contribution.bucket = "screened_out";
      contribution.direction = "contextual";
      contribution.exclusionReason = "superseded_in_group";
      contribution.reason = "A stronger active signal already represents this semantic group.";
    }
  }
  const signalPoints = Math.min(25, [...strongest.values()].filter(item => item.appliedPoints > 0).reduce((sum, item) => sum + item.appliedPoints, 0));
  const negativePoints = Math.min(10, Math.abs([...strongest.values()].filter(item => item.appliedPoints < 0).reduce((sum, item) => sum + item.appliedPoints, 0)));
  return { signalPoints, negativePoints, contributions };
}
