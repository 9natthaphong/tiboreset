import { formatUtcTimestamp } from "@/lib/format-date";

export function formatHistoricalMemoryTimestamp(value: string): string {
  return formatUtcTimestamp(value).replace(",", " ·");
}

export function historicalOutcomePresentation(followed: boolean | null, outcome: string): {
  scored: boolean;
  title: string;
  explanation: string;
} {
  if (followed === null) {
    return {
      scored: false,
      title: "FORWARD OUTCOME NOT SCORED",
      explanation: "No verified forward label is available for this historical window. It is excluded from performance evaluation.",
    };
  }

  return {
    scored: true,
    title: followed ? "VERIFIED RESET FOLLOWED" : "NO RESET IN FORWARD HORIZON",
    explanation: outcome,
  };
}

export function historicalForecastPresentation(forecastBefore?: number): string {
  return forecastBefore === undefined ? "Pre-event forecast unavailable" : `Pre-event forecast: ${forecastBefore}%`;
}
