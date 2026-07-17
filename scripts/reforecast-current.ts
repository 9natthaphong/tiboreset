import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { refreshCurrentForecast } from "../src/lib/forecasting/current-refresh";
import { MODEL_V2_VERSION } from "../src/lib/forecasting/v2";
import { SupabaseIngestionRepository } from "../src/lib/ingestion/supabase-repository";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are unavailable");
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const result = await refreshCurrentForecast({
    repository: new SupabaseIngestionRepository(client),
    calculatedAt: new Date().toISOString(),
  });
  if (result.forecast.modelVersion !== MODEL_V2_VERSION) throw new Error("The production-default forecast is not Reset Oracle v2");
  console.log({
    previousForecastId: result.previous?.id ?? null,
    previousModelVersion: result.previous?.modelVersion ?? null,
    previousProbability: result.previous?.probability ?? null,
    newForecastId: result.forecastId ?? "skipped",
    newModelVersion: result.forecast.modelVersion,
    policyDrivenProbability: result.forecast.policyModel?.policyProbability ?? 0,
    signalDrivenProbability: result.forecast.policyModel?.discretionaryProbability ?? 0,
    combinedProbability: result.forecast.probability,
    alertBand: result.forecast.policyModel?.alertBand ?? "LOW",
    saveReason: result.forecastSaveReason,
    externalIngestionCalls: 0,
  });
}

void main().catch(error => {
  console.error({ ok: false, error: error instanceof Error ? error.message : "Current forecast refresh failed" });
  process.exitCode = 1;
});
