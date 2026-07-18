const utcTimestampFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
});

const utcShortDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const resetUtcFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const resetThailandFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" });

export function formatUtcTimestamp(value: string): string {
  return `${utcTimestampFormatter.format(new Date(value))} UTC`;
}

export function formatUtcShortDate(value: string): string {
  return utcShortDateFormatter.format(new Date(value));
}

export function formatResetEventTimes(value: string): { thailand: string; utc: string } {
  const date = new Date(value);
  const withoutConnector = (formatted: string) => formatted.replace(" at ", ", ");
  return {
    thailand: `${withoutConnector(resetThailandFormatter.format(date))} ICT`,
    utc: `${withoutConnector(resetUtcFormatter.format(date))} UTC`,
  };
}
