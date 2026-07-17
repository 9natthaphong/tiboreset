import { describe, expect, it } from "vitest";
import { evaluateAmbiguityCandidate } from "@/lib/extraction/ambiguity-backfill";
import { localExtract } from "@/lib/extraction/local";

describe("ambiguity safety backfill", () => {
  it("corrects a legacy joke impact and is idempotent", () => {
    const text = "I actually stole their reset button. Youre welcome Codex.";
    const legacy = { ...localExtract(text), requires_review: false, forecastImpact: 8 };
    const first = evaluateAmbiguityCandidate({ text, requiresReview: false, eventPayload: legacy });
    expect(first).toMatchObject({ violatesSafetyRule: true, needsUpdate: true });
    expect(first.correctedPayload).toMatchObject({ requires_review: true, forecastImpact: 0, reset_confirmed: false });
    const second = evaluateAmbiguityCandidate({ text, requiresReview: true, eventPayload: first.correctedPayload });
    expect(second).toMatchObject({ violatesSafetyRule: true, needsUpdate: false });
  });

  it("does not alter a credible operational commitment", () => {
    const text = "We will reset usage limits tomorrow.";
    const extraction = localExtract(text);
    const result = evaluateAmbiguityCandidate({ text, requiresReview: false, eventPayload: { ...extraction, forecastImpact: 8 } });
    expect(result).toMatchObject({ violatesSafetyRule: false, needsUpdate: false });
  });
});
