import type { MilestoneObservation } from "./milestone-arrival";

export type PolicyPosterior = { successes: number; failures: number; alpha: number; beta: number; mean: number; conservativeInterval: [number, number] };

export function resetGivenMilestonePosterior(observations: MilestoneObservation[]): PolicyPosterior {
  const successes = observations.filter(item => item.resetType === "full" || item.resetType === "banked" || item.resetType === "scheduled").length;
  const failures = observations.filter(item => item.resetType === "announcement_only").length;
  const alpha = 1 + successes;
  const beta = 1 + failures;
  const mean = alpha / (alpha + beta);
  const variance = alpha * beta / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const radius = 1.645 * Math.sqrt(variance);
  return { successes, failures, alpha, beta, mean, conservativeInterval: [Math.max(0, mean - radius), Math.min(1, mean + radius)] };
}
