import { MODEL_CONFIG } from "../model-config";
import type { Features, HistogramBucket, SimulationSummary } from "../types";
import { combineIndependentRisks } from "./combine";
import { discretionaryNames, discretionaryProbability } from "./discretionary-hazard";
import { mixtureConditionalProbability, type IntervalEstimate } from "./milestone-arrival";
import type { PolicyPosterior } from "./policy-posterior";

function rng(seed: number) { let x = seed | 0; return () => { x |= 0; x = x + 0x6D2B79F5 | 0; let t = Math.imul(x ^ x >>> 15, 1 | x); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const normal = (random: () => number) => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9))) * Math.cos(2 * Math.PI * random());
function gamma(random: () => number, shape: number): number { if (shape < 1) return gamma(random, shape + 1) * random() ** (1 / shape); const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d); for (;;) { const value = normal(random); const v = (1 + c * value) ** 3; if (v > 0 && (random() < 1 - .0331 * value ** 4 || Math.log(random()) < .5 * value ** 2 + d * (1 - v + Math.log(v)))) return d * v; } }
const beta = (random: () => number, alpha: number, betaValue: number) => { const left = gamma(random, alpha); return left / (left + gamma(random, betaValue)); };
const quantile = (values: number[], q: number) => values[Math.floor((values.length - 1) * q)];
function summary(values: number[], count: number, seed: number): SimulationSummary { const sorted = [...values].sort((a, b) => a - b); const mean = sorted.reduce((sum, value) => sum + value, 0) / count; const standardDeviation = Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count); const histogram: HistogramBucket[] = Array.from({ length: 10 }, (_, index) => ({ from: index / 10, to: (index + 1) / 10, count: sorted.filter(value => value >= index / 10 && (index === 9 ? value <= 1 : value < (index + 1) / 10)).length })); return { mean, median: quantile(sorted, .5), p10: quantile(sorted, .1), p25: quantile(sorted, .25), p75: quantile(sorted, .75), p90: quantile(sorted, .9), standardDeviation, histogram, count, seed }; }

export function policyMonteCarlo(input: { features: Features; interval: IntervalEstimate; posterior: PolicyPosterior; horizonHours: number; policyActive: boolean; arrivalEvidenceBoost: number; count?: number; seed?: number }) {
  const count = input.count ?? 5_000;
  const seed = input.seed ?? 20260716;
  const random = rng(seed);
  const policy: number[] = [], discretionary: number[] = [], combined: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const longMedian = Math.max(1, (input.interval.longTermMedianHours ?? 720) * Math.exp(normal(random) * input.interval.longTermLogSigma / Math.sqrt(Math.max(1, input.interval.longTermIntervalsHours.length))));
    const recentMedian = input.interval.recentMedianHours == null ? null : Math.max(1, input.interval.recentMedianHours * Math.exp(normal(random) * input.interval.recentLogSigma / Math.sqrt(Math.max(1, input.interval.recentIntervalsHours.length))));
    const regimeWeight = Math.max(0, Math.min(1, input.interval.regimeWeight + normal(random) * .12 / Math.sqrt(Math.max(1, input.interval.recentIntervalsHours.length))));
    let arrival = input.policyActive && input.interval.elapsedHours != null ? mixtureConditionalProbability({ elapsedHours: input.interval.elapsedHours, horizonHours: input.horizonHours, longMedianHours: longMedian, recentMedianHours: recentMedian, longSigma: input.interval.longTermLogSigma, recentSigma: input.interval.recentLogSigma, regimeWeight }) : 0;
    if (input.arrivalEvidenceBoost > 0) { const odds = arrival / Math.max(1e-9, 1 - arrival); arrival = odds * (1 + input.arrivalEvidenceBoost) / (1 + odds * (1 + input.arrivalEvidenceBoost)); }
    const policyValue = arrival * beta(random, input.posterior.alpha, input.posterior.beta);
    const coefficients = Object.fromEntries(discretionaryNames.map(name => [name, MODEL_CONFIG.coefficients[name].mean + normal(random) * MODEL_CONFIG.coefficients[name].uncertainty]));
    const discretionaryValue = discretionaryProbability(input.features, input.horizonHours, coefficients, MODEL_CONFIG.intercept + normal(random) * .3);
    policy.push(policyValue); discretionary.push(discretionaryValue); combined.push(combineIndependentRisks(policyValue, discretionaryValue));
  }
  return { total: summary(combined, count, seed), policy: summary(policy, count, seed), discretionary: summary(discretionary, count, seed) };
}
