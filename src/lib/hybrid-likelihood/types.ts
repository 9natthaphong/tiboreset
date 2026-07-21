import type { Forecast } from "@/lib/forecasting";

export type HybridState = "normal_cycle" | "imminent_commitment" | "new_cycle";
export type WatchWinningChannel = "timing" | "policy_timing" | "live_signal" | "none" | "near_term_commitment";
export type StructuredSignalType =
  | "irrelevant"
  | "general_update"
  | "operator_intervention"
  | "operational_work_underway"
  | "reset_hint"
  | "milestone_progress"
  | "milestone_commitment"
  | "limit_policy_change"
  | "reset_policy_continuation"
  | "near_term_reset_commitment"
  | "reset_confirmation"
  | "negative_or_delaying_signal";

export type StructuredSignal = {
  signalType: StructuredSignalType;
  operationalRelevance: "none" | "low" | "moderate" | "high";
  resetIntentStrength: number;
  operatorInterventionStrength: number;
  timeImmediacy: "none" | "low" | "moderate" | "high" | "immediate";
  sourceAuthority: "monitored_official" | "official" | "unknown";
  extractionConfidence: number;
  requiresReview: boolean;
  uncertainties: string[];
  resetConfirmed: boolean;
  resetType: "full" | "banked" | "scheduled" | "announcement_only" | "temporary_limit_change" | "unknown" | "none";
  policyScope?: "none" | "ongoing";
  policyPersistence?: "none" | "active" | "uncertain" | "withdrawn";
};

export type HybridSignalInput = {
  id: string;
  postId: string;
  text: string;
  postedAt: string;
  sourceUrl: string;
  signal: StructuredSignal;
  verificationStatus: "verified" | "structured" | "needs_review" | "rejected";
};

export type HybridResetEvent = {
  id: string;
  occurredAt: string;
  resetType: "full" | "banked";
  verified: boolean;
  sourcePostId?: string;
  sourceRecordId?: string;
  sourceUrl?: string;
  sourceText?: string;
  verificationSource?: string;
  synchronizedKnownReset?: boolean;
  synchronizedMilestone?: boolean;
};

export type SignalContribution = {
  signalId: string;
  postId: string;
  signalType: StructuredSignalType;
  semanticGroup: string;
  direction: "raised" | "lowered" | "confirmed" | "contextual";
  semanticCeiling: number;
  confidenceFactor: number;
  recencyFactor: number;
  readinessValue: number;
  negativePenalty: number;
  watchCounterfactualDeltaPoints: number | null;
  bucket: "forecast_moving" | "screened_out";
  exclusionReason: "before_cycle_start" | "expired" | "requires_review" | "irrelevant" | "superseded_in_group" | "previous_cycle_resolved" | null;
  reason: string;
};

export type CycleEstimate = {
  cycleStartAt: string | null;
  elapsedCycleHours: number;
  effectiveElapsedHours: number;
  expectedCycleHours: number;
  elapsedCycleRatio: number;
  cyclePoints: number;
  intervalSource: "recent_long_term_blend" | "recent_median" | "long_term_median" | "single_interval" | "conservative_fallback";
  intervalSampleCount: number;
};

export type HybridLikelihood = CycleEstimate & {
  watchModelVersion: "sacred-watch-2.0.0";
  watchScore: number;
  hybridState: HybridState;
  cyclePoints: number;
  cycleMaturity: number;
  timingChannel: number;
  policyTimingChannel: number;
  strongestSignalChannel: number;
  negativePenalty: number;
  maxWinningChannel: WatchWinningChannel;
  whyThisScore: string;
  appliedOverride: "near_term_reset_commitment" | null;
  calculatedAt: string;
  evidenceCutoff: string;
  calibratedProbability: number;
  credibleInterval: [number, number];
  calibratedModelVersion: string;
  confirmation: HybridResetEvent | null;
  previousCycleResolvedAt: string | null;
  previousCycleFinalProbability: number | null;
  eventResolutionStatus: "resolved" | "none";
  activeSignals: SignalContribution[];
  excludedSignals: SignalContribution[];
  policyRegimeState: "inactive" | "reset_policy_active" | "reset_policy_uncertain" | "reset_policy_withdrawn";
  policyRegimeSourcePostId: string | null;
  policyRegimeActivatedAt: string | null;
  policyRegimeExpiresAt: string | null;
  policyRegimeConfidence: number;
  policyRegimeReason: string;
  policyRegimeAgeHours: number | null;
  policyRegimeDecayFactor: number;
  policyRegimeWatchCounterfactualDeltaPoints: number | null;
  policyRegimeCalibratedCounterfactualDeltaPercentagePoints: number | null;
};

export type HybridLikelihoodInput = {
  forecast: Forecast;
  resetEvents: HybridResetEvent[];
  signals: HybridSignalInput[];
  now: string;
  resolvedForecastProbability?: number | null;
  visitorCount?: number;
};
