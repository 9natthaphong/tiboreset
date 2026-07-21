import { estimateCycle } from "./cycle";
import { scoreSignals } from "./signals";
import { derivePolicyRegime, POLICY_REGIME_EXPIRY_HOURS } from "./policy-regime";
import type { HybridLikelihood, HybridLikelihoodInput, HybridResetEvent, SignalContribution, WatchWinningChannel } from "./types";

export const WATCH_MODEL_VERSION = "sacred-watch-2.0.0" as const;
const HOUR = 3_600_000;
const MAX_CYCLE_POINTS = 20;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

function latestVerifiedReset(events: HybridResetEvent[], cutoff: string): HybridResetEvent | null {
  const time = Date.parse(cutoff);
  return events
    .filter(item => item.verified && (item.resetType === "full" || item.resetType === "banked") && Date.parse(item.occurredAt) <= time)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null;
}

function winningChannel(timing: number, policy: number, signal: number): WatchWinningChannel {
  const maximum = Math.max(timing, policy, signal);
  if (maximum <= 0) return "none";
  if (signal === maximum) return "live_signal";
  if (policy === maximum) return "policy_timing";
  return "timing";
}

function scoreFromChannels(timing: number, policy: number, signal: number, negativePenalty: number) {
  const raw = Math.max(clamp01(timing), clamp01(policy), clamp01(signal));
  const adjusted = raw * (1 - clamp01(negativePenalty));
  return Math.round(clamp(adjusted * 100, 0, 94));
}

function explanation(input: {
  winner: WatchWinningChannel;
  policyActive: boolean;
  cycleMaturity: number;
  negativePenalty: number;
  override: boolean;
}) {
  if (input.override) return "A credible official near-term reset commitment is active. This is an operational override, not a calibrated probability.";
  const penalty = input.negativePenalty > 0 ? " Bounded negative evidence reduces the winning readiness channel once." : "";
  if (input.winner === "policy_timing") {
    if (input.cycleMaturity < .25) return `Official evidence supports continuing resets, but the latest reset was recent and no new timing commitment exists. Policy confidence is high while near-term readiness remains low.${penalty}`;
    if (input.cycleMaturity < .75) return `Official evidence supports continuing resets and the cycle is developing, but no near-term commitment exists. Policy status and timing readiness remain separate.${penalty}`;
    return `Official evidence supports continuing resets and the cycle has reached a mature part of its observed cadence, but no specific next-reset time was promised.${penalty}`;
  }
  if (input.winner === "live_signal") return `A current structured public signal is the strongest readiness channel. Related posts are not summed, and no language-model output directly sets this score.${penalty}`;
  if (input.winner === "timing") return `${input.policyActive ? "Reset policy remains active, but " : ""}Reset Oracle v2's next-36-hour estimate is the strongest current readiness channel.${penalty}`;
  return `No eligible timing, policy-timing, or live-signal channel is currently elevated.${penalty}`;
}

function applyCounterfactuals(input: {
  contributions: SignalContribution[];
  timingChannel: number;
  policyTimingChannel: number;
  strongestSignalChannel: number;
  negativePenalty: number;
  watchScore: number;
  policySourcePostId: string | null;
}) {
  const activeReadiness = input.contributions.filter(item => item.bucket === "forecast_moving" && item.readinessValue > 0);
  for (const contribution of input.contributions) {
    if (contribution.bucket !== "forecast_moving") continue;
    if (contribution.postId === input.policySourcePostId) {
      const withoutPolicy = scoreFromChannels(input.timingChannel, 0, input.strongestSignalChannel, input.negativePenalty);
      contribution.watchCounterfactualDeltaPoints = input.watchScore - withoutPolicy;
      continue;
    }
    if (contribution.readinessValue > 0) {
      const nextSignal = activeReadiness.filter(item => item.signalId !== contribution.signalId).reduce((maximum, item) => Math.max(maximum, item.readinessValue), 0);
      const withoutSignal = scoreFromChannels(input.timingChannel, input.policyTimingChannel, nextSignal, input.negativePenalty);
      contribution.watchCounterfactualDeltaPoints = input.watchScore - withoutSignal;
      continue;
    }
    if (contribution.negativePenalty > 0) {
      const withoutNegative = scoreFromChannels(input.timingChannel, input.policyTimingChannel, input.strongestSignalChannel, 0);
      contribution.watchCounterfactualDeltaPoints = input.watchScore - withoutNegative;
    }
  }
}

export function calculateHybridLikelihood(input: HybridLikelihoodInput): HybridLikelihood {
  const latestReset = latestVerifiedReset(input.resetEvents, input.now);
  const cycle = estimateCycle(input.resetEvents, input.now);
  const scored = scoreSignals(input.signals, input.now, cycle.cycleStartAt);
  const policyRegime = derivePolicyRegime(input.signals, input.now);
  for (const contribution of scored.contributions) {
    if (contribution.signalType !== "reset_policy_continuation" || contribution.postId === policyRegime.sourcePostId) continue;
    const source = input.signals.find(item => item.postId === contribution.postId);
    const expired = policyRegime.state === "inactive" && source
      ? Date.parse(input.now) - Date.parse(source.postedAt) >= POLICY_REGIME_EXPIRY_HOURS * HOUR
      : false;
    contribution.bucket = "screened_out";
    contribution.direction = "contextual";
    contribution.readinessValue = 0;
    contribution.negativePenalty = 0;
    contribution.exclusionReason = expired ? "expired" : "superseded_in_group";
    contribution.reason = expired
      ? "The reset-policy statement expired after seven days without reinforcement."
      : "A newer or stronger official reset-policy statement is the active regime source.";
  }
  if (latestReset?.sourcePostId) {
    const confirmationContribution = scored.contributions.find(item => item.postId === latestReset.sourcePostId && item.signalType === "reset_confirmation");
    if (confirmationContribution) {
      confirmationContribution.bucket = "forecast_moving";
      confirmationContribution.direction = "confirmed";
      confirmationContribution.readinessValue = 0;
      confirmationContribution.negativePenalty = 0;
      confirmationContribution.exclusionReason = "previous_cycle_resolved";
      confirmationContribution.reason = "The official completed reset resolved the previous cycle; it contributes zero to the active Reset Watch Score.";
    }
  }

  const credibleCommitment = input.signals.some(item => item.signal.signalType === "near_term_reset_commitment" && !item.signal.requiresReview && item.signal.resetIntentStrength >= .8 && item.signal.extractionConfidence >= .85 && Date.parse(item.postedAt) > Date.parse(input.now) - 36 * HOUR && (!cycle.cycleStartAt || Date.parse(item.postedAt) > Date.parse(cycle.cycleStartAt)));
  const cycleMaturity = clamp01(cycle.cyclePoints / MAX_CYCLE_POINTS);
  const timingChannel = clamp01(input.forecast.probability);
  const policyTimingChannel = policyRegime.state === "reset_policy_active"
    ? clamp01(policyRegime.confidence * cycleMaturity * policyRegime.decayFactor)
    : 0;
  const strongestSignalChannel = clamp01(scored.strongestSignalChannel);
  const negativePenalty = clamp01(scored.negativePenalty);
  const ordinaryWinner = winningChannel(timingChannel, policyTimingChannel, strongestSignalChannel);
  const ordinaryScore = scoreFromChannels(timingChannel, policyTimingChannel, strongestSignalChannel, negativePenalty);
  const watchScore = credibleCommitment ? 95 : ordinaryScore;
  const maxWinningChannel: WatchWinningChannel = credibleCommitment ? "near_term_commitment" : ordinaryWinner;

  applyCounterfactuals({ contributions: scored.contributions, timingChannel, policyTimingChannel, strongestSignalChannel, negativePenalty, watchScore: ordinaryScore, policySourcePostId: policyRegime.sourcePostId });
  const activeSignals = scored.contributions.filter(item => item.bucket === "forecast_moving");
  const excludedSignals = scored.contributions.filter(item => item.bucket === "screened_out");
  const policyContribution = activeSignals.find(item => item.postId === policyRegime.sourcePostId);

  return {
    ...cycle,
    watchModelVersion: WATCH_MODEL_VERSION,
    watchScore,
    hybridState: credibleCommitment ? "imminent_commitment" : cycle.cycleStartAt ? "new_cycle" : "normal_cycle",
    cycleMaturity,
    timingChannel,
    policyTimingChannel,
    strongestSignalChannel,
    negativePenalty,
    maxWinningChannel,
    whyThisScore: explanation({ winner: maxWinningChannel, policyActive: policyRegime.state === "reset_policy_active", cycleMaturity, negativePenalty, override: credibleCommitment }),
    appliedOverride: credibleCommitment ? "near_term_reset_commitment" : null,
    calculatedAt: input.now,
    evidenceCutoff: input.now,
    calibratedProbability: input.forecast.probability,
    credibleInterval: [input.forecast.credibleIntervalLow, input.forecast.credibleIntervalHigh],
    calibratedModelVersion: input.forecast.modelVersion,
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
    policyRegimeAgeHours: policyRegime.ageHours,
    policyRegimeDecayFactor: policyRegime.decayFactor,
    policyRegimeWatchCounterfactualDeltaPoints: policyContribution?.watchCounterfactualDeltaPoints ?? null,
    policyRegimeCalibratedCounterfactualDeltaPercentagePoints: null,
  };
}

export * from "./types";
export * from "./cycle";
export * from "./signals";
export * from "./policy-regime";
