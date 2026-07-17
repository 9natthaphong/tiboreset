import { createHash } from "node:crypto";
import { versionedForecastContext } from "@/lib/forecast-context";
import { explain } from "./explain";
import { buildFeatureSnapshot } from "./features";
import { MODEL_CONFIG } from "./model-config";
import { monteCarlo } from "./monte-carlo";
import type { Evidence, Forecast, ForecastContext } from "./types";
import { policyForecast, MODEL_V2_VERSION, discretionaryNames, type MilestoneObservation } from "./v2";

export * from "./types";
export * from "./hazard-model";
export * from "./features";
export * from "./calibration";
export * from "./backtest";

export function forecastFromEvidenceV1(
  evidence: Evidence[],
  cutoff = new Date().toISOString(),
  horizonHours = 36,
  count = Number(process.env.MONTE_CARLO_SIMULATIONS ?? 5000),
  seed = Number(process.env.MONTE_CARLO_SEED ?? 20260716),
  context: ForecastContext = versionedForecastContext(cutoff),
): Forecast {
  const snapshot = buildFeatureSnapshot(evidence, cutoff, context);
  const simulation = monteCarlo(snapshot.features, MODEL_CONFIG, horizonHours, count, seed);
  const probability = snapshot.features.explicit_reset_confirmation > .9 ? Math.max(.98, simulation.median) : simulation.median;
  const configurationHash = createHash("sha256").update(JSON.stringify(MODEL_CONFIG)).digest("hex").slice(0, 16);
  return {
    id: `fc-${Date.parse(cutoff)}`,
    generatedAt: cutoff,
    horizonHours,
    probability,
    credibleIntervalLow: simulation.p10,
    credibleIntervalHigh: simulation.p90,
    predictedWindowStart: new Date(Date.parse(cutoff) + horizonHours * .35 * 36e5).toISOString(),
    predictedWindowEnd: new Date(Date.parse(cutoff) + horizonHours * 36e5).toISOString(),
    dataCutoff: cutoff,
    features: snapshot.features,
    featureOrigins: snapshot.origins,
    featureDetails: snapshot.details,
    contributions: explain(snapshot.features, MODEL_CONFIG),
    simulation,
    evidenceIds: evidence.map(item => item.id),
    sourcePostIds: evidence.map(item => item.postId),
    modelVersion: MODEL_CONFIG.version,
    configurationHash,
    mode: process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo",
  };
}

export function forecastFromEvidence(
  evidence: Evidence[],
  cutoff = new Date().toISOString(),
  horizonHours = 36,
  count = Number(process.env.MONTE_CARLO_SIMULATIONS ?? 5000),
  seed = Number(process.env.MONTE_CARLO_SEED ?? 20260716),
  context: ForecastContext = versionedForecastContext(cutoff),
): Forecast {
  const milestones: MilestoneObservation[] = context.milestoneObservations.map(item => ({ users: item.milestoneUsers, announcedAt: item.occurredAt, resetType: item.resetType ?? (context.verifiedResets.some(reset => reset.milestoneUsers === item.milestoneUsers && Date.parse(reset.occurredAt) === Date.parse(item.occurredAt)) ? "full" : "announcement_only") }));
  const result = policyForecast({ evidence, milestones, cutoff, horizonHours, count, seed, context });
  const configurationHash = createHash("sha256").update(`${MODEL_V2_VERSION}:lognormal-renewal:beta-1-1:discretionary-v1-priors`).digest("hex").slice(0, 16);
  const discretionaryFeatureNames = new Set<string>(discretionaryNames);
  const discretionaryContributions = explain(result.features, MODEL_CONFIG).filter(item => discretionaryFeatureNames.has(item.featureName));
  return { id: `fc-v2-${Date.parse(cutoff)}`, generatedAt: cutoff, horizonHours, probability: result.probability, credibleIntervalLow: result.low, credibleIntervalHigh: result.high, predictedWindowStart: new Date(Date.parse(cutoff) + horizonHours * .35 * 36e5).toISOString(), predictedWindowEnd: new Date(Date.parse(cutoff) + horizonHours * 36e5).toISOString(), dataCutoff: cutoff, features: result.features, featureOrigins: result.featureOrigins, featureDetails: result.featureDetails, contributions: discretionaryContributions, simulation: result.simulation.total, evidenceIds: result.evidenceIds, sourcePostIds: evidence.filter(item => Date.parse(item.postedAt) <= Date.parse(cutoff)).map(item => item.postId), modelVersion: MODEL_V2_VERSION, configurationHash, mode: process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo", policyModel: { policyProbability: result.policyProbability, discretionaryProbability: result.discretionaryProbability, nextTargetUsers: result.nextTargetUsers, latestMilestoneUsers: result.latestMilestoneUsers, policyStatus: result.policyStatus, recentIntervalMedianHours: result.interval.recentMedianHours, longTermIntervalMedianHours: result.interval.longTermMedianHours, regimeWeight: result.interval.regimeWeight, elapsedHours: result.interval.elapsedHours, conditionalArrivalProbability: result.interval.conditionalArrivalProbability, posteriorSuccesses: result.posterior.successes, posteriorFailures: result.posterior.failures, posteriorMean: result.posterior.mean, posteriorInterval: result.posterior.conservativeInterval, discretionaryCooldown: result.features.recent_reset_suppression, alertBand: result.alertBand, policySimulation: result.simulation.policy, discretionarySimulation: result.simulation.discretionary } };
}
