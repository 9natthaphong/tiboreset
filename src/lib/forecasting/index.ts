import { createHash } from "node:crypto";
import { versionedForecastContext } from "@/lib/forecast-context";
import { explain } from "./explain";
import { buildFeatureSnapshot } from "./features";
import { MODEL_CONFIG } from "./model-config";
import { monteCarlo } from "./monte-carlo";
import type { Evidence, Forecast, ForecastContext } from "./types";

export * from "./types";
export * from "./hazard-model";
export * from "./features";
export * from "./calibration";
export * from "./backtest";

export function forecastFromEvidence(
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
