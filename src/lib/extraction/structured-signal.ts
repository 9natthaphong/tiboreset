import type { EventType } from "@/lib/forecasting";
import type { StructuredSignal } from "@/lib/hybrid-likelihood";
import { localExtract } from "./local";
import { hasExplicitCompletedOperationalReset } from "./safety";

const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function structuredSignalFromStored(input: {
  text: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  confidence: number;
  requiresReview: boolean;
}): StructuredSignal {
  const local = localExtract(input.text);
  const signalType = typeof input.payload.signal_type === "string"
    ? input.payload.signal_type
    : input.eventType === "explicit_reset_confirmation" ? "reset_confirmation"
      : local.signal_type;
  const resetType = typeof input.payload.reset_type === "string" ? input.payload.reset_type : local.reset_type;
  return {
    signalType: signalType as StructuredSignal["signalType"],
    operationalRelevance: (typeof input.payload.operational_relevance === "string" ? input.payload.operational_relevance : local.operational_relevance) as StructuredSignal["operationalRelevance"],
    resetIntentStrength: number(input.payload.reset_intent_strength, number(input.payload.commitment_strength, local.reset_intent_strength)),
    operatorInterventionStrength: number(input.payload.operator_intervention_strength, local.operator_intervention_strength),
    timeImmediacy: (typeof input.payload.time_immediacy === "string" ? input.payload.time_immediacy : local.time_immediacy) as StructuredSignal["timeImmediacy"],
    sourceAuthority: "monitored_official",
    extractionConfidence: number(input.confidence),
    requiresReview: input.requiresReview,
    uncertainties: strings(input.payload.uncertainties),
    resetConfirmed: input.payload.reset_confirmed === true && hasExplicitCompletedOperationalReset(input.text),
    resetType: resetType as StructuredSignal["resetType"],
  };
}
