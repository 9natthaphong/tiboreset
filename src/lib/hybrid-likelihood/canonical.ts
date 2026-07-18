import { forecastFromEvidence, type Evidence, type Forecast, type ForecastContext } from "@/lib/forecasting";
import { calculateHybridLikelihood } from "./index";
import type { HybridLikelihood, HybridResetEvent, HybridSignalInput } from "./types";

export type PersistedForecastReference = {
  id: string;
  generatedAt: string;
  modelVersion: string;
  probability: number;
  credibleIntervalLow: number;
  credibleIntervalHigh: number;
  evidencePostIds?: string[];
} | null;

export type CanonicalHybridSnapshot = {
  status: "available";
  cutoff: string;
  forecast: Forecast;
  hybrid: HybridLikelihood;
  persistedForecast: PersistedForecastReference;
  resolvedForecast: PersistedForecastReference;
  evidence: Evidence[];
  signals: HybridSignalInput[];
  resetEvents: HybridResetEvent[];
};

function mergeResetIntoContext(context: ForecastContext, resetEvents: HybridResetEvent[]): ForecastContext {
  const verifiedResets = [...context.verifiedResets];
  for (const event of resetEvents) {
    if (!event.verified || verifiedResets.some(item => Date.parse(item.occurredAt) === Date.parse(event.occurredAt))) continue;
    verifiedResets.push({ occurredAt: event.occurredAt, verified: true });
  }
  return { ...context, verifiedResets: verifiedResets.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)) };
}

export function buildCanonicalHybridSnapshot(input: {
  cutoff: string;
  evidence: Evidence[];
  signals: HybridSignalInput[];
  resetEvents: HybridResetEvent[];
  context: ForecastContext;
  persistedForecast?: PersistedForecastReference;
  persistedForecasts?: Exclude<PersistedForecastReference, null>[];
  simulations?: number;
  seed?: number;
}): CanonicalHybridSnapshot {
  const latestReset = input.resetEvents
    .filter(item => item.verified && Date.parse(item.occurredAt) <= Date.parse(input.cutoff))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null;
  const activeCycleEvidence = latestReset
    ? input.evidence.filter(item => Date.parse(item.postedAt) > Date.parse(latestReset.occurredAt) && Date.parse(item.postedAt) <= Date.parse(input.cutoff))
    : input.evidence.filter(item => Date.parse(item.postedAt) <= Date.parse(input.cutoff));
  const forecastReferences = input.persistedForecasts ?? (input.persistedForecast ? [input.persistedForecast] : []);
  const resolvedForecast = latestReset
    ? forecastReferences.find(item => latestReset.sourceRecordId
      ? item.evidencePostIds?.includes(latestReset.sourceRecordId)
      : Date.parse(item.generatedAt) >= Date.parse(latestReset.occurredAt) && item.probability >= .98) ?? null
    : null;
  const context = mergeResetIntoContext(input.context, input.resetEvents);
  const forecast = forecastFromEvidence(activeCycleEvidence, input.cutoff, 36, input.simulations, input.seed, context);
  const hybrid = calculateHybridLikelihood({ forecast, resetEvents: input.resetEvents, signals: input.signals, now: input.cutoff, resolvedForecastProbability: resolvedForecast?.probability ?? null });
  return { status: "available", cutoff: input.cutoff, forecast, hybrid, persistedForecast: input.persistedForecast ?? null, resolvedForecast, evidence: activeCycleEvidence, signals: input.signals, resetEvents: input.resetEvents };
}
