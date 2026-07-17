export type MilestoneObservation = { users: number; announcedAt: string; resetType: "full" | "banked" | "scheduled" | "announcement_only" };
export type IntervalEstimate = {
  intervalsHours: number[];
  longTermIntervalsHours: number[];
  recentIntervalsHours: number[];
  longTermMedianHours: number | null;
  recentMedianHours: number | null;
  longTermLogSigma: number;
  recentLogSigma: number;
  regimeWeight: number;
  elapsedHours: number | null;
  conditionalArrivalProbability: number;
};

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const erf = (value: number) => { const sign = value < 0 ? -1 : 1; const x = Math.abs(value); const t = 1 / (1 + .3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return sign * y; };
const logNormalSurvival = (hours: number, medianHours: number, sigma: number) => hours <= 0 ? 1 : clamp(1 - .5 * (1 + erf((Math.log(hours) - Math.log(medianHours)) / (sigma * Math.SQRT2))), 1e-9, 1);

export function conditionalLogNormalProbability(elapsedHours: number, horizonHours: number, medianHours: number, logSigma: number): number {
  const survived = logNormalSurvival(elapsedHours, medianHours, logSigma);
  return clamp(1 - logNormalSurvival(elapsedHours + horizonHours, medianHours, logSigma) / survived);
}

export function milestoneIntervals(observations: MilestoneObservation[]): number[] {
  const sorted = [...observations].sort((a, b) => a.users - b.users || Date.parse(a.announcedAt) - Date.parse(b.announcedAt));
  return sorted.slice(1).flatMap((current, index) => current.users - sorted[index].users === 1_000_000 ? [(Date.parse(current.announcedAt) - Date.parse(sorted[index].announcedAt)) / 3_600_000] : []);
}

function robustLogSigma(intervals: number[], minimum: number) {
  if (intervals.length < 2) return minimum + .45;
  const logs = intervals.map(Math.log);
  const center = median(logs)!;
  const mad = median(logs.map(value => Math.abs(value - center))) ?? 0;
  return Math.max(minimum, 1.4826 * mad);
}

export function estimateMilestoneArrival(observations: MilestoneObservation[], cutoff: string, horizonHours: number): IntervalEstimate {
  const available = observations.filter(item => Date.parse(item.announcedAt) < Date.parse(cutoff)).sort((a, b) => a.users - b.users);
  const intervals = milestoneIntervals(available);
  const latest = available.at(-1);
  const elapsedHours = latest ? Math.max(0, (Date.parse(cutoff) - Date.parse(latest.announcedAt)) / 3_600_000) : null;
  if (!intervals.length || elapsedHours == null) return { intervalsHours: intervals, longTermIntervalsHours: intervals, recentIntervalsHours: [], longTermMedianHours: median(intervals), recentMedianHours: null, longTermLogSigma: 1, recentLogSigma: 1, regimeWeight: 0, elapsedHours, conditionalArrivalProbability: 0 };
  const provisionalLongMedian = median(intervals.slice(0, -1).length ? intervals.slice(0, -1) : intervals)!;
  const shortThreshold = Math.max(72, provisionalLongMedian * .35);
  const recent: number[] = [];
  for (let index = intervals.length - 1; index >= 0 && intervals[index] <= shortThreshold; index -= 1) recent.unshift(intervals[index]);
  const longTerm = recent.length < intervals.length ? intervals.slice(0, intervals.length - recent.length) : intervals;
  const longMedian = median(longTerm);
  const recentMedian = median(recent);
  const regimeWeight = recent.length === 0 ? 0 : recent.length === 1 ? .68 : recent.length === 2 ? .86 : .93;
  const longSigma = robustLogSigma(longTerm, .35);
  const recentSigma = robustLogSigma(recent, .45);
  const conditionalArrivalProbability = longMedian ? mixtureConditionalProbability({ elapsedHours, horizonHours, longMedianHours: longMedian, recentMedianHours: recentMedian, longSigma, recentSigma, regimeWeight }) : 0;
  return { intervalsHours: intervals, longTermIntervalsHours: longTerm, recentIntervalsHours: recent, longTermMedianHours: longMedian, recentMedianHours: recentMedian, longTermLogSigma: longSigma, recentLogSigma: recentSigma, regimeWeight, elapsedHours, conditionalArrivalProbability };
}

export function mixtureConditionalProbability(input: { elapsedHours: number; horizonHours: number; longMedianHours: number; recentMedianHours: number | null; longSigma: number; recentSigma: number; regimeWeight: number }) {
  const longNow = logNormalSurvival(input.elapsedHours, input.longMedianHours, input.longSigma);
  const longLater = logNormalSurvival(input.elapsedHours + input.horizonHours, input.longMedianHours, input.longSigma);
  const recentNow = input.recentMedianHours ? logNormalSurvival(input.elapsedHours, input.recentMedianHours, input.recentSigma) : longNow;
  const recentLater = input.recentMedianHours ? logNormalSurvival(input.elapsedHours + input.horizonHours, input.recentMedianHours, input.recentSigma) : longLater;
  const survivalNow = input.regimeWeight * recentNow + (1 - input.regimeWeight) * longNow;
  const survivalLater = input.regimeWeight * recentLater + (1 - input.regimeWeight) * longLater;
  return clamp(1 - survivalLater / Math.max(1e-9, survivalNow));
}
