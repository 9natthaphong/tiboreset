import { buildMilestoneSeedRows, loadHistoricalDatasets } from "@/lib/historical-data";
import { reviewedOperationalEventsAt } from "@/lib/external-context";
import type { ForecastContext } from "@/lib/forecasting/types";
import { deriveMilestoneState } from "@/lib/milestones";

export function versionedForecastContext(cutoff: string): ForecastContext {
  const datasets = loadHistoricalDatasets();
  const verifiedLedger = datasets.ledger.records.filter(record => record.verificationStatus === "verified" && Date.parse(record.eventAt) <= Date.parse(cutoff));
  const milestoneState = deriveMilestoneState(buildMilestoneSeedRows(datasets).filter(event => Date.parse(event.announcedAt) <= Date.parse(cutoff)));
  return {
    verifiedResets: verifiedLedger
      .filter(record => record.resetType !== "scheduled")
      .map(record => ({ occurredAt: record.eventAt, milestoneUsers: record.milestoneUsers, verified: true })),
    milestoneObservations: verifiedLedger.map(record => ({ occurredAt: record.eventAt, milestoneUsers: record.milestoneUsers, verified: true })),
    historicalWindows: datasets.windows.windows
      .filter(window => Date.parse(window.eventAt) <= Date.parse(cutoff))
      .map(window => ({ eventAt: window.eventAt, verificationStatus: window.verificationStatus, featureVector: window.featureVector, resetFollowedWithinHorizon: window.resetFollowedWithinHorizon })),
    operationalSignals: reviewedOperationalEventsAt(cutoff).map(event => ({ occurredAt: event.occurredAt, verified: true, strength: event.forecastWeight })),
    nextPledgedMilestoneUsers: milestoneState.nextTargetUsers,
  };
}
