const utcTimestampFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
});

const utcShortDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export function formatUtcTimestamp(value: string): string {
  return `${utcTimestampFormatter.format(new Date(value))} UTC`;
}

export function formatUtcShortDate(value: string): string {
  return utcShortDateFormatter.format(new Date(value));
}
