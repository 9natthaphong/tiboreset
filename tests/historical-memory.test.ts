import { describe, expect, it } from "vitest";
import { formatHistoricalMemoryTimestamp, historicalForecastPresentation, historicalOutcomePresentation } from "@/lib/historical-memory";

describe("Historical Memory presentation", () => {
  it("formats UTC timestamps deterministically while retaining an ISO dateTime in the component", () => {
    expect(formatHistoricalMemoryTimestamp("2026-04-07T13:48:00.000Z")).toBe("07 Apr 2026 · 13:48 UTC");
  });

  it("explains why an unscored window is excluded from evaluation", () => {
    expect(historicalOutcomePresentation(null, "Unavailable")).toEqual({
      scored: false,
      title: "FORWARD OUTCOME NOT SCORED",
      explanation: "No verified forward label is available for this historical window. It is excluded from performance evaluation.",
    });
    expect(historicalForecastPresentation()).toBe("Pre-event forecast unavailable");
  });

  it("keeps verified forward outcomes distinct from similarity", () => {
    expect(historicalOutcomePresentation(true, "Reset followed within the reviewed horizon")).toEqual({
      scored: true,
      title: "VERIFIED RESET FOLLOWED",
      explanation: "Reset followed within the reviewed horizon",
    });
    expect(historicalOutcomePresentation(false, "No reset followed").title).toBe("NO RESET IN FORWARD HORIZON");
  });
});
