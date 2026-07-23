import { forecastFromEvidence } from "@/lib/forecasting";
import { calculateHybridLikelihood } from "./index";
import type { HybridResetEvent, HybridSignalInput, StructuredSignal, WatchWinningChannel } from "./types";

export type WatchScenarioRow = {
  scenario: string;
  timingChannel: number;
  cyclePressureChannel: number;
  policyChannel: number;
  signalChannel: number;
  negativePenalty: number;
  winningChannel: WatchWinningChannel;
  watchScore: number;
  calibratedProbability: number;
};

const HOUR = 3_600_000;
const currentResetAt = "2026-01-02T00:00:00Z";
const previousResetAt = "2026-01-01T00:00:00Z";
const resets: HybridResetEvent[] = [
  { id: "previous", occurredAt: previousResetAt, resetType: "full", verified: true, sourcePostId: "previous-reset" },
  { id: "current", occurredAt: currentResetAt, resetType: "full", verified: true, sourcePostId: "current-reset" },
];

const structured = (overrides: Partial<StructuredSignal>): StructuredSignal => ({
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

const signal = (id: string, postedAt: string, overrides: Partial<StructuredSignal>): HybridSignalInput => ({
  id: `event-${id}`,
  postId: id,
  text: id,
  postedAt,
  sourceUrl: `https://example.invalid/${id}`,
  signal: structured(overrides),
  verificationStatus: "structured",
});

const policy = signal("policy", "2026-01-01T23:00:00Z", {
  signalType: "reset_policy_continuation",
  operationalRelevance: "high",
  resetIntentStrength: .9,
  timeImmediacy: "low",
  extractionConfidence: .92,
  policyScope: "ongoing",
  policyPersistence: "active",
});

const atHours = (hours: number) => new Date(Date.parse(currentResetAt) + hours * HOUR).toISOString();

function row(input: {
  scenario: string;
  probability: number;
  now: string;
  signals?: HybridSignalInput[];
  resetEvents?: HybridResetEvent[];
}) {
  const base = forecastFromEvidence([], input.now, 36, 80, 17);
  const forecast = { ...base, probability: input.probability, credibleIntervalLow: Math.max(0, input.probability - .04), credibleIntervalHigh: Math.min(1, input.probability + .08) };
  const result = calculateHybridLikelihood({ forecast, resetEvents: input.resetEvents ?? resets, signals: input.signals ?? [], now: input.now, resolvedForecastProbability: .98 });
  return {
    scenario: input.scenario,
    timingChannel: result.timingChannel,
    cyclePressureChannel: result.cyclePressureChannel,
    policyChannel: result.policyTimingChannel,
    signalChannel: result.strongestSignalChannel,
    negativePenalty: result.negativePenalty,
    winningChannel: result.maxWinningChannel,
    watchScore: result.watchScore,
    calibratedProbability: result.calibratedProbability,
  } satisfies WatchScenarioRow;
}

export function buildWatchScenarioTable(): WatchScenarioRow[] {
  const operator = signal("operator", atHours(1), { signalType: "operator_intervention", operationalRelevance: "moderate", operatorInterventionStrength: .65, resetIntentStrength: .15, timeImmediacy: "low", extractionConfidence: .68 });
  const working = signal("work", atHours(1), { signalType: "operational_work_underway", operationalRelevance: "high", resetIntentStrength: .8, timeImmediacy: "high", extractionConfidence: .92 });
  const hint = signal("hint", atHours(1), { signalType: "reset_hint", operationalRelevance: "high", resetIntentStrength: .75, timeImmediacy: "high", extractionConfidence: .9 });
  const milestone = signal("milestone", atHours(1), { signalType: "milestone_commitment", operationalRelevance: "high", resetIntentStrength: .9, timeImmediacy: "moderate", extractionConfidence: .94 });
  const commitment = signal("commitment", atHours(1), { signalType: "near_term_reset_commitment", operationalRelevance: "high", resetIntentStrength: .92, timeImmediacy: "high", extractionConfidence: .93 });
  const negative = signal("delay", atHours(1), { signalType: "negative_or_delaying_signal", operationalRelevance: "high", resetIntentStrength: .9, timeImmediacy: "high", extractionConfidence: .95 });
  const withdrawal = signal("withdrawal", atHours(1), { signalType: "negative_or_delaying_signal", operationalRelevance: "high", resetIntentStrength: 1, timeImmediacy: "high", extractionConfidence: .95, policyScope: "ongoing", policyPersistence: "withdrawn" });
  const completedAt = atHours(2);
  const completed = signal("completed", completedAt, { signalType: "reset_confirmation", operationalRelevance: "high", resetIntentStrength: 1, timeImmediacy: "immediate", extractionConfidence: .98, resetConfirmed: true, resetType: "full" });
  const completedReset: HybridResetEvent = { id: "completed", occurredAt: completedAt, resetType: "full", verified: true, sourcePostId: "completed" };
  const expectedCycleHours = 24;

  return [
    row({ scenario: "Just after reset, no policy, no signals", probability: .03, now: currentResetAt }),
    row({ scenario: "Just after reset, active continuation policy", probability: .03, now: currentResetAt, signals: [policy] }),
    row({ scenario: "Quarter expected cycle, no policy", probability: .05, now: atHours(expectedCycleHours * .25) }),
    row({ scenario: "Quarter expected cycle, active policy", probability: .12, now: atHours(expectedCycleHours * .25), signals: [policy] }),
    row({ scenario: "Half expected cycle, no policy", probability: .08, now: atHours(expectedCycleHours * .5) }),
    row({ scenario: "Half expected cycle, active policy", probability: .2, now: atHours(expectedCycleHours * .5), signals: [policy] }),
    row({ scenario: "Expected cycle reached, no policy", probability: .1, now: atHours(expectedCycleHours) }),
    row({ scenario: "Expected cycle reached, active policy", probability: .35, now: atHours(expectedCycleHours), signals: [policy] }),
    row({ scenario: "One-and-a-half expected cycles, no policy", probability: .12, now: atHours(expectedCycleHours * 1.5) }),
    row({ scenario: "One-and-a-half expected cycles, active policy", probability: .38, now: atHours(expectedCycleHours * 1.5), signals: [policy] }),
    row({ scenario: "Operator intervention without timing", probability: .08, now: atHours(2), signals: [operator] }),
    row({ scenario: "Operational work underway", probability: .18, now: atHours(2), signals: [working] }),
    row({ scenario: "Reset hint", probability: .22, now: atHours(2), signals: [hint] }),
    row({ scenario: "Milestone commitment", probability: .32, now: atHours(2), signals: [milestone] }),
    row({ scenario: "Near-term reset commitment", probability: .4, now: atHours(2), signals: [commitment] }),
    row({ scenario: "Completed reset", probability: .03, now: completedAt, signals: [completed], resetEvents: [...resets, completedReset] }),
    row({ scenario: "Policy withdrawn", probability: .15, now: atHours(2), signals: [policy, withdrawal] }),
    row({ scenario: "Strong negative evidence", probability: .45, now: atHours(2), signals: [working, negative] }),
  ];
}
