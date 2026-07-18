import type { CycleEstimate, HybridResetEvent } from "./types";

const HOUR = 3_600_000;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function interpolateCyclePoints(ratio: number): number {
  const value = Math.max(0, ratio);
  const anchors: Array<[number, number]> = [[0, 0], [.25, 5], [.5, 10], [1, 15], [2, 20]];
  if (value >= 2) return 20;
  for (let index = 1; index < anchors.length; index += 1) {
    const [rightX, rightY] = anchors[index];
    const [leftX, leftY] = anchors[index - 1];
    if (value <= rightX) {
      const progress = (value - leftX) / (rightX - leftX);
      const smooth = progress * progress * (3 - 2 * progress);
      return leftY + (rightY - leftY) * smooth;
    }
  }
  return 20;
}

export function estimateCycle(events: HybridResetEvent[], now: string): CycleEstimate {
  const cutoff = Date.parse(now);
  const eligible = events
    .filter(item => item.verified && Number.isFinite(Date.parse(item.occurredAt)) && Date.parse(item.occurredAt) <= cutoff)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const intervals = eligible.slice(1).map((item, index) => (Date.parse(item.occurredAt) - Date.parse(eligible[index].occurredAt)) / HOUR).filter(value => value > 0);
  const longTerm = median(intervals);
  const recentIntervals = intervals.filter(value => value <= 72).slice(-3);
  const recent = median(recentIntervals);
  let expectedCycleHours = 168;
  let intervalSource: CycleEstimate["intervalSource"] = "conservative_fallback";
  if (recent != null && longTerm != null && intervals.length >= 2) {
    expectedCycleHours = Math.sqrt(recent * longTerm);
    intervalSource = "recent_long_term_blend";
  } else if (recent != null) {
    expectedCycleHours = recent;
    intervalSource = "recent_median";
  } else if (longTerm != null && intervals.length > 1) {
    expectedCycleHours = longTerm;
    intervalSource = "long_term_median";
  } else if (longTerm != null) {
    expectedCycleHours = longTerm;
    intervalSource = "single_interval";
  }
  expectedCycleHours = Math.max(6, expectedCycleHours);
  const latest = eligible.at(-1);
  const elapsedCycleHours = latest ? Math.max(0, (cutoff - Date.parse(latest.occurredAt)) / HOUR) : 0;
  const effectiveElapsedHours = elapsedCycleHours;
  const elapsedCycleRatio = expectedCycleHours > 0 ? effectiveElapsedHours / expectedCycleHours : 0;
  return {
    cycleStartAt: latest?.occurredAt ?? null,
    elapsedCycleHours,
    effectiveElapsedHours,
    expectedCycleHours,
    elapsedCycleRatio,
    cyclePoints: interpolateCyclePoints(elapsedCycleRatio),
    intervalSource,
    intervalSampleCount: intervals.length,
  };
}
