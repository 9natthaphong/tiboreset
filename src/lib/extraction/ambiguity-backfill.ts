import { localExtract } from "./local";
import { ExtractionSchema, type Extraction } from "./schema";
import { enforceExtractionSafety } from "./safety";

const extractionKeys = [
  "is_relevant", "relevance_reason", "event_type", "reset_mentioned", "reset_confirmed", "commitment_strength",
  "milestone_target", "milestone_current", "milestone_denominator", "incident_strength", "capacity_concern",
  "promotional_signal", "time_reference", "reset_type", "evidence_quotes", "uncertainties",
  "extraction_confidence", "requires_review",
] as const satisfies readonly (keyof Extraction)[];

export type StoredAmbiguityCandidate = {
  text: string;
  requiresReview: boolean | null;
  eventPayload: Record<string, unknown>;
};

export type AmbiguityBackfillEvaluation = {
  violatesSafetyRule: boolean;
  needsUpdate: boolean;
  correctedPayload: Record<string, unknown>;
};

function storedExtraction(payload: Record<string, unknown>, fallback: Extraction): Extraction {
  const known = Object.fromEntries(extractionKeys.flatMap(key => key in payload ? [[key, payload[key]]] : []));
  return ExtractionSchema.parse({ ...fallback, ...known });
}

export function evaluateAmbiguityCandidate(candidate: StoredAmbiguityCandidate): AmbiguityBackfillEvaluation {
  const local = localExtract(candidate.text);
  const stored = storedExtraction(candidate.eventPayload, local);
  const safe = enforceExtractionSafety(candidate.text, stored);
  const violatesSafetyRule = safe.requires_review || local.requires_review;
  const previousImpact = typeof candidate.eventPayload.forecastImpact === "number"
    ? candidate.eventPayload.forecastImpact
    : typeof candidate.eventPayload.forecast_impact === "number" ? candidate.eventPayload.forecast_impact : 0;
  if (!violatesSafetyRule) return { violatesSafetyRule: false, needsUpdate: false, correctedPayload: candidate.eventPayload };

  const correctedExtraction = { ...safe, requires_review: true, reset_confirmed: false };
  const correctedPayload = {
    ...candidate.eventPayload,
    ...correctedExtraction,
    forecastImpact: 0,
    forecast_impact: 0,
    ambiguitySafetyBackfillVersion: "ambiguity-safety-1.0.0",
  };
  return {
    violatesSafetyRule: true,
    needsUpdate: candidate.requiresReview !== true || previousImpact !== 0 || candidate.eventPayload.requires_review !== true,
    correctedPayload,
  };
}
