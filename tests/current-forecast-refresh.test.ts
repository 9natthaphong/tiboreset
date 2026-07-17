import { describe, expect, it } from "vitest";
import { forecastFromEvidence, type Forecast, type ForecastContext } from "@/lib/forecasting";
import { forecastFreshness, forecastSaveDecision, refreshCurrentForecast, type ForecastRefreshRepository, type StoredForecastSummary } from "@/lib/forecasting/current-refresh";
import { policyForecast, type MilestoneObservation } from "@/lib/forecasting/v2";

const history: MilestoneObservation[] = [
  { users: 3_000_000, announcedAt: "2026-04-07T23:13:48Z", resetType: "full" },
  { users: 4_000_000, announcedAt: "2026-04-21T14:52:11Z", resetType: "full" },
  { users: 5_000_000, announcedAt: "2026-05-31T05:59:10Z", resetType: "scheduled" },
  { users: 6_000_000, announcedAt: "2026-07-12T17:59:57Z", resetType: "full" },
  { users: 7_000_000, announcedAt: "2026-07-13T18:29:31Z", resetType: "banked" },
  { users: 8_000_000, announcedAt: "2026-07-14T19:34:54Z", resetType: "full" },
  { users: 9_000_000, announcedAt: "2026-07-16T04:14:09Z", resetType: "full" },
];

const context: ForecastContext = {
  verifiedResets: history.filter(item => item.resetType !== "scheduled").map(item => ({ occurredAt: item.announcedAt, milestoneUsers: item.users, verified: true })),
  milestoneObservations: history.map(item => ({ occurredAt: item.announcedAt, milestoneUsers: item.users, verified: true, resetType: item.resetType })),
  historicalWindows: [],
  operationalSignals: [],
  nextPledgedMilestoneUsers: 10_000_000,
};

function summary(forecast: Forecast, overrides: Partial<StoredForecastSummary> = {}): StoredForecastSummary {
  return {
    id: "previous",
    modelVersion: forecast.modelVersion,
    configurationHash: forecast.configurationHash,
    probability: forecast.probability,
    credibleIntervalLow: forecast.credibleIntervalLow,
    credibleIntervalHigh: forecast.credibleIntervalHigh,
    generatedAt: forecast.generatedAt,
    alertBand: forecast.policyModel?.alertBand ?? "LOW",
    ...overrides,
  };
}

class RefreshRepository implements ForecastRefreshRepository {
  forecasts: Forecast[] = [];
  databaseReads = 0;
  async loadForecastEvidence() { this.databaseReads += 1; return []; }
  async loadForecastContext() { this.databaseReads += 1; return context; }
  async getLatestForecast() { this.databaseReads += 1; const latest = this.forecasts.at(-1); return latest ? summary(latest, { id: `forecast-${this.forecasts.length}` }) : null; }
  async saveForecast(forecast: Forecast) { this.forecasts.push(forecast); return `forecast-${this.forecasts.length}`; }
}

describe("current v2 forecast refresh", () => {
  it("changes policy risk as elapsed milestone time changes without new posts", () => {
    const earlier = policyForecast({ evidence: [], milestones: history, cutoff: "2026-07-16T10:00:00Z", count: 300, seed: 9 });
    const later = policyForecast({ evidence: [], milestones: history, cutoff: "2026-07-16T18:00:00Z", count: 300, seed: 9 });
    expect(later.interval.elapsedHours).toBeGreaterThan(earlier.interval.elapsedHours!);
    expect(later.policyProbability).not.toBe(earlier.policyProbability);
  });

  it("does not write an unchanged snapshot after only fifteen minutes", () => {
    const next = forecastFromEvidence([], "2026-07-16T12:15:00Z", 36, 100, 4, context);
    const previous = summary(next, { generatedAt: "2026-07-16T12:00:00Z" });
    expect(forecastSaveDecision(previous, next, next.generatedAt)).toEqual({ save: false, reason: "below_materiality_threshold" });
  });

  it("forces a save after one hour", () => {
    const next = forecastFromEvidence([], "2026-07-16T13:00:00Z", 36, 100, 4, context);
    const previous = summary(next, { generatedAt: "2026-07-16T12:00:00Z" });
    expect(forecastSaveDecision(previous, next, next.generatedAt)).toEqual({ save: true, reason: "snapshot_age_exceeded" });
  });

  it("forces a save when an alert band changes below the numeric materiality threshold", () => {
    const next = forecastFromEvidence([], "2026-07-16T12:00:00Z", 36, 100, 4, context);
    next.probability = .401;
    next.policyModel!.alertBand = "ELEVATED";
    const previous = summary(next, { probability: .399, alertBand: "WATCH", generatedAt: "2026-07-16T11:50:00Z" });
    expect(forecastSaveDecision(previous, next, next.generatedAt)).toEqual({ save: true, reason: "alert_band_changed" });
  });

  it("forces a save when the model version changes", () => {
    const next = forecastFromEvidence([], "2026-07-16T12:00:00Z", 36, 100, 4, context);
    expect(forecastSaveDecision(summary(next, { modelVersion: "reset-oracle-1.1.0" }), next, next.generatedAt)).toEqual({ save: true, reason: "model_version_changed" });
  });

  it("uses only forecast repository operations and is safe to rerun", async () => {
    const repository = new RefreshRepository();
    const first = await refreshCurrentForecast({ repository, calculatedAt: "2026-07-16T12:00:00Z", simulations: 100, seed: 5 });
    const second = await refreshCurrentForecast({ repository, calculatedAt: "2026-07-16T12:00:00Z", simulations: 100, seed: 5 });
    expect(first.forecastId).toBe("forecast-1");
    expect(second.forecastId).toBeNull();
    expect(second.forecastSaveReason).toBe("below_materiality_threshold");
    expect(repository.forecasts).toHaveLength(1);
    expect(repository.databaseReads).toBe(6);
  });

  it("reports freshness only for a recent v2 calculation", () => {
    const now = new Date("2026-07-16T13:29:00Z");
    expect(forecastFreshness("2026-07-16T12:00:00Z", "reset-oracle-2.0.0", now)).toBe("FRESH");
    expect(forecastFreshness("2026-07-16T11:59:00Z", "reset-oracle-2.0.0", now)).toBe("STALE");
    expect(forecastFreshness("2026-07-16T13:00:00Z", "reset-oracle-1.1.0", now)).toBe("STALE");
  });
});

