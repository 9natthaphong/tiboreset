import demo from "@/data/demo.json";
import { OracleExperience } from "@/components/oracle-experience";
import { getPublicSnapshot } from "@/lib/public-data";
import { findHistoricalAnalogWindows } from "@/lib/historical-data";
import { getEmailConfigurationStatus } from "@/lib/notifications/email-config";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await getPublicSnapshot();
  const emailAlertsConfigured = getEmailConfigurationStatus() === "configured";
  const analogs = snapshot.forecast.mode === "live" ? findHistoricalAnalogWindows(snapshot.forecast.features, snapshot.forecast.dataCutoff).map(item => ({ date: item.eventAt, eventType: item.eventCategory, similarity: Math.round(item.similarity * 100), outcome: item.verificationNotes, source: item.sourceExcerpt, followed: item.resetFollowedWithinHorizon, forecastBefore: item.forecastBefore == null ? undefined : Math.round(item.forecastBefore * 100) })) : demo.analogs.map(item => ({ ...item, followed: item.followed as boolean | null }));
  return <OracleExperience initialForecast={snapshot.forecast} evidence={snapshot.evidence} history={snapshot.history} latestPosts={snapshot.latestPosts} resetHistory={snapshot.resetHistory} historicalDataset={snapshot.historicalDataset} externalContextEvents={snapshot.externalContextEvents} health={snapshot.health} analogs={analogs} renderedAt={new Date().toISOString()} emailAlertsConfigured={emailAlertsConfigured}/>;
}
