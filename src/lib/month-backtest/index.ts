import { forecastFromEvidenceV1, type Evidence, type Features, type ForecastContext } from "@/lib/forecasting";
import { versionedForecastContext } from "@/lib/forecast-context";

export const MONTH_BACKTEST_VERSION = "walk-forward-2026-07-17.1";

export function mergeUniquePosts<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  return [...new Map([...existing, ...incoming].map(item => [item.id, item])).values()];
}

export function requiresExternalAcquisition(cache: { complete: boolean } | null, refresh = false): boolean {
  return refresh || !cache?.complete;
}

export function honestBacktestStatus(input: { interpretation: string; brierSkillScore: number | null }): string {
  if (input.interpretation === "Insufficient data") return "Insufficient data for an accuracy claim";
  if (input.brierSkillScore == null || input.brierSkillScore <= 0) return "No demonstrated predictive value versus base rate";
  return input.interpretation;
}

export type VerifiedAnnouncement = {
  id: string;
  announcedAt: string;
  resetType: "full" | "banked" | "scheduled" | "announcement_only";
  milestoneUsers: number | null;
  sourcePostId: string | null;
  sourceUrl: string;
  executionAt: string | null;
  executionVerified: boolean;
};

export type RollingRow = {
  cutoff: string;
  test: "realtime" | "strict_pre_announcement";
  probability: number;
  low: number;
  high: number;
  outcome: boolean;
  evidenceIds: string[];
  features: Features;
  strongestFeatures: Array<{ name: string; contribution: number }>;
  baselines: { timeSinceReset: number; milestoneProximity: number; cooldownMilestone: number };
};

export function generateCutoffs(from: string, to: string, stepHours: number): string[] {
  const rows: string[] = [];
  for (let time = Date.parse(from); time < Date.parse(to); time += stepHours * 3_600_000) rows.push(new Date(time).toISOString());
  return rows;
}

export function hasCompleteOutcomeHorizon(cutoff: string, evaluationEnd: string, horizonHours: number): boolean {
  return Date.parse(cutoff) + horizonHours * 3_600_000 <= Date.parse(evaluationEnd);
}

export function announcementOutcome(cutoff: string, horizonHours: number, events: VerifiedAnnouncement[]): boolean {
  const start = Date.parse(cutoff);
  const end = start + horizonHours * 3_600_000;
  return events.some(event => event.resetType !== "announcement_only" && Date.parse(event.announcedAt) > start && Date.parse(event.announcedAt) <= end);
}

export function executionOutcome(cutoff: string, horizonHours: number, events: VerifiedAnnouncement[]): boolean | null {
  const eligible = events.filter(event => event.executionVerified && event.executionAt);
  if (!eligible.length) return null;
  const start = Date.parse(cutoff);
  const end = start + horizonHours * 3_600_000;
  return eligible.some(event => Date.parse(event.executionAt!) > start && Date.parse(event.executionAt!) <= end);
}

export function cutoffContext(cutoff: string): ForecastContext {
  const context = versionedForecastContext(cutoff);
  const cutoffMs = Date.parse(cutoff);
  return {
    ...context,
    verifiedResets: context.verifiedResets.filter(item => Date.parse(item.occurredAt) <= cutoffMs),
    milestoneObservations: context.milestoneObservations.filter(item => Date.parse(item.occurredAt) <= cutoffMs),
    historicalWindows: context.historicalWindows.filter(item => Date.parse(item.eventAt) <= cutoffMs),
    operationalSignals: context.operationalSignals.filter(item => Date.parse(item.occurredAt) <= cutoffMs),
  };
}

const clampProbability = (value: number) => Math.max(.000001, Math.min(.999999, value));

export function baselineProbabilities(features: Features) {
  return {
    timeSinceReset: clampProbability(.05 + .35 * features.time_since_last_reset),
    milestoneProximity: clampProbability(.05 + .7 * features.milestone_proximity),
    cooldownMilestone: clampProbability(.05 + .6 * features.milestone_proximity - .25 * features.recent_reset_suppression),
  };
}

export function runWalkForward(input: { cutoffs: string[]; horizonHours: number; evidence: Evidence[]; events: VerifiedAnnouncement[]; excludedPostIds?: Set<string>; test: RollingRow["test"] }): RollingRow[] {
  return input.cutoffs.map(cutoff => {
    const cutoffMs = Date.parse(cutoff);
    const visible = input.evidence.filter(item => Date.parse(item.postedAt) <= cutoffMs && !input.excludedPostIds?.has(item.postId));
    const forecast = forecastFromEvidenceV1(visible, cutoff, input.horizonHours, 5_000, Number(process.env.MONTE_CARLO_SEED ?? 20260716), cutoffContext(cutoff));
    return {
      cutoff,
      test: input.test,
      probability: forecast.probability,
      low: forecast.credibleIntervalLow,
      high: forecast.credibleIntervalHigh,
      outcome: announcementOutcome(cutoff, input.horizonHours, input.events),
      evidenceIds: forecast.evidenceIds,
      features: forecast.features,
      strongestFeatures: forecast.contributions.filter(item => item.logOddsContribution > 0).sort((a, b) => b.logOddsContribution - a.logOddsContribution).slice(0, 3).map(item => ({ name: item.featureName, contribution: item.logOddsContribution })),
      baselines: baselineProbabilities(forecast.features),
    };
  });
}

export type ThresholdMetric = { threshold: number; precision: number | null; recall: number; falsePositives: number; falseNegatives: number };
export type CalibrationRow = { label: string; count: number; meanProbability: number | null; observedRate: number | null };

function rocAuc(rows: RollingRow[]): number | null {
  const positives = rows.filter(row => row.outcome);
  const negatives = rows.filter(row => !row.outcome);
  if (!positives.length || !negatives.length) return null;
  let wins = 0;
  for (const positive of positives) for (const negative of negatives) wins += positive.probability > negative.probability ? 1 : positive.probability === negative.probability ? .5 : 0;
  return wins / (positives.length * negatives.length);
}

function averagePrecision(rows: RollingRow[]): number | null {
  const positives = rows.filter(row => row.outcome).length;
  if (!positives || positives === rows.length) return null;
  let found = 0;
  let total = 0;
  [...rows].sort((a, b) => b.probability - a.probability).forEach((row, index) => { if (row.outcome) { found += 1; total += found / (index + 1); } });
  return total / positives;
}

export function binaryMetrics(rows: RollingRow[]) {
  const positives = rows.filter(row => row.outcome).length;
  const baseRate = rows.length ? positives / rows.length : 0;
  const brier = rows.length ? rows.reduce((sum, row) => sum + (row.probability - Number(row.outcome)) ** 2, 0) / rows.length : 0;
  const baselineBrier = rows.length ? rows.reduce((sum, row) => sum + (baseRate - Number(row.outcome)) ** 2, 0) / rows.length : 0;
  const logLoss = rows.length ? -rows.reduce((sum, row) => sum + (row.outcome ? Math.log(clampProbability(row.probability)) : Math.log(1 - clampProbability(row.probability))), 0) / rows.length : 0;
  const baselineScores = Object.fromEntries(["timeSinceReset", "milestoneProximity", "cooldownMilestone"].map(name => [name, rows.reduce((sum, row) => sum + (row.baselines[name as keyof typeof row.baselines] - Number(row.outcome)) ** 2, 0) / Math.max(1, rows.length)]));
  const thresholds: ThresholdMetric[] = [.3, .5, .6, .7, .8].map(threshold => {
    const tp = rows.filter(row => row.probability >= threshold && row.outcome).length;
    const fp = rows.filter(row => row.probability >= threshold && !row.outcome).length;
    const fn = rows.filter(row => row.probability < threshold && row.outcome).length;
    return { threshold, precision: tp + fp ? tp / (tp + fp) : null, recall: positives ? tp / positives : 0, falsePositives: fp, falseNegatives: fn };
  });
  const bins = [[0, .1], [.1, .3], [.3, .5], [.5, .7], [.7, .9], [.9, 1.000001]];
  const calibration: CalibrationRow[] = bins.map(([from, to]) => { const bucket = rows.filter(row => row.probability >= from && row.probability < to); return { label: `${Math.round(from * 100)}-${Math.round(Math.min(1, to) * 100)}%`, count: bucket.length, meanProbability: bucket.length ? bucket.reduce((sum, row) => sum + row.probability, 0) / bucket.length : null, observedRate: bucket.length ? bucket.filter(row => row.outcome).length / bucket.length : null }; });
  return { cutoffs: rows.length, positiveWindows: positives, negativeWindows: rows.length - positives, eventBaseRate: baseRate, brierScore: brier, baselineBrierScore: baselineBrier, brierSkillScore: baselineBrier ? 1 - brier / baselineBrier : null, logLoss, rocAuc: rocAuc(rows), averagePrecision: averagePrecision(rows), calibration, thresholds, baselineScores };
}

export function thresholdCrossing(rows: RollingRow[], eventAt: string, threshold: number) {
  const before = rows.filter(row => Date.parse(row.cutoff) < Date.parse(eventAt)).sort((a, b) => Date.parse(a.cutoff) - Date.parse(b.cutoff));
  const crossing = before.find((row, index) => row.probability >= threshold && (index === 0 || before[index - 1].probability < threshold));
  return crossing ? { at: crossing.cutoff, leadHours: (Date.parse(eventAt) - Date.parse(crossing.cutoff)) / 3_600_000 } : null;
}

export function eventResults(rows: RollingRow[], events: VerifiedAnnouncement[]) {
  return events.filter(event => event.resetType !== "announcement_only").map(event => {
    const before = rows.filter(row => Date.parse(row.cutoff) < Date.parse(event.announcedAt));
    const maximum = before.reduce<RollingRow | null>((best, row) => !best || row.probability > best.probability ? row : best, null);
    const atLead = (hours: number) => [...before].filter(row => Date.parse(row.cutoff) <= Date.parse(event.announcedAt) - hours * 3_600_000).sort((a, b) => Date.parse(b.cutoff) - Date.parse(a.cutoff))[0]?.probability ?? null;
    const crossings = Object.fromEntries([.3, .5, .6, .7, .8].map(threshold => [String(threshold), thresholdCrossing(rows, event.announcedAt, threshold)]));
    return { eventId: event.id, eventTimestamp: event.announcedAt, eventType: event.resetType, milestoneUsers: event.milestoneUsers, maximumPreAnnouncementProbability: maximum?.probability ?? null, probability36HoursBefore: atLead(36), probability24HoursBefore: atLead(24), probability12HoursBefore: atLead(12), probability6HoursBefore: atLead(6), thresholdCrossings: crossings, predictedBeforePublication: (maximum?.probability ?? 0) >= .5, strongestPreAnnouncementFeatures: maximum?.strongestFeatures ?? [], missedSignalExplanation: (maximum?.probability ?? 0) >= .5 ? null : "The frozen model did not cross 50% before the official announcement using cutoff-safe evidence." };
  });
}
