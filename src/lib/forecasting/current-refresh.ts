import { forecastFromEvidence, type Evidence, type Forecast, type ForecastContext } from "@/lib/forecasting";
import { MODEL_V2_VERSION, policyAlertBand } from "@/lib/forecasting/v2";

export const FORECAST_MATERIALITY_THRESHOLD = 0.005;
export const FORECAST_MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1_000;
export const FORECAST_FRESHNESS_AGE_MS = 90 * 60 * 1_000;
export const SOURCE_FRESHNESS_AGE_MS = 45 * 60 * 1_000;

export type StoredForecastSummary = {
  id: string;
  modelVersion: string;
  configurationHash: string;
  probability: number;
  credibleIntervalLow: number;
  credibleIntervalHigh: number;
  generatedAt: string;
  alertBand: ReturnType<typeof policyAlertBand>;
};

export type ForecastSaveReason =
  | "no_previous_forecast"
  | "model_version_changed"
  | "configuration_changed"
  | "probability_materially_changed"
  | "credible_interval_materially_changed"
  | "alert_band_changed"
  | "snapshot_age_exceeded"
  | "below_materiality_threshold";

export type ForecastRefreshRepository = {
  loadForecastEvidence(): Promise<Evidence[]>;
  loadForecastContext?(): Promise<ForecastContext>;
  getLatestForecast(): Promise<StoredForecastSummary | null>;
  saveForecast(forecast: Forecast): Promise<string>;
};

export type ForecastSaveDecision = { save: boolean; reason: ForecastSaveReason };

export function forecastSaveDecision(previous: StoredForecastSummary | null, next: Forecast, calculatedAt: string): ForecastSaveDecision {
  if (!previous) return { save: true, reason: "no_previous_forecast" };
  if (previous.modelVersion !== next.modelVersion) return { save: true, reason: "model_version_changed" };
  if (previous.configurationHash !== next.configurationHash) return { save: true, reason: "configuration_changed" };
  if (Math.abs(previous.probability - next.probability) >= FORECAST_MATERIALITY_THRESHOLD) return { save: true, reason: "probability_materially_changed" };
  if (Math.abs(previous.credibleIntervalLow - next.credibleIntervalLow) >= FORECAST_MATERIALITY_THRESHOLD || Math.abs(previous.credibleIntervalHigh - next.credibleIntervalHigh) >= FORECAST_MATERIALITY_THRESHOLD) return { save: true, reason: "credible_interval_materially_changed" };
  const nextBand = next.policyModel?.alertBand ?? policyAlertBand(next.probability);
  if (previous.alertBand !== nextBand) return { save: true, reason: "alert_band_changed" };
  if (Date.parse(calculatedAt) - Date.parse(previous.generatedAt) >= FORECAST_MAX_SNAPSHOT_AGE_MS) return { save: true, reason: "snapshot_age_exceeded" };
  return { save: false, reason: "below_materiality_threshold" };
}

export function forecastFreshness(calculatedAt: string | null, modelVersion: string | null, now = new Date()): "FRESH" | "STALE" {
  if (!calculatedAt || modelVersion !== MODEL_V2_VERSION) return "STALE";
  const age = now.getTime() - Date.parse(calculatedAt);
  return Number.isFinite(age) && age >= 0 && age < FORECAST_FRESHNESS_AGE_MS ? "FRESH" : "STALE";
}

export function sourceFreshness(lastSuccessfulIngestionAt: string | null, now = new Date()): "FRESH" | "STALE" {
  if (!lastSuccessfulIngestionAt) return "STALE";
  const age = now.getTime() - Date.parse(lastSuccessfulIngestionAt);
  return Number.isFinite(age) && age >= 0 && age < SOURCE_FRESHNESS_AGE_MS ? "FRESH" : "STALE";
}

export async function refreshCurrentForecast(input: {
  repository: ForecastRefreshRepository;
  calculatedAt: string;
  horizonHours?: number;
  simulations?: number;
  seed?: number;
}) {
  // Keep production refresh reads sequential. This avoids connection bursts in
  // short-lived CLI/serverless runtimes while preserving the same cutoff.
  const evidence = await input.repository.loadForecastEvidence();
  const context = await input.repository.loadForecastContext?.();
  const previous = await input.repository.getLatestForecast();
  const forecast = forecastFromEvidence(
    evidence,
    input.calculatedAt,
    input.horizonHours ?? Number(process.env.FORECAST_HORIZON_HOURS ?? 36),
    input.simulations,
    input.seed,
    context,
  );
  const decision = forecastSaveDecision(previous, forecast, input.calculatedAt);
  const savedForecastId = decision.save ? await input.repository.saveForecast({ ...forecast, mode: "live" }) : null;
  return {
    previous,
    forecast,
    forecastRecalculated: true as const,
    forecastChanged: decision.save,
    forecastSaveReason: decision.reason,
    forecastId: savedForecastId,
  };
}
