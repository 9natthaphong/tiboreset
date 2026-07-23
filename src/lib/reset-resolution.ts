import { hasExplicitCompletedOperationalReset, hasExplicitScheduledOperationalResetAnnouncement } from "@/lib/extraction/safety";
import type { StructuredSignal } from "@/lib/hybrid-likelihood";

export type VerifiedResetResolution = {
  resetType: "full" | "banked" | "scheduled";
  resolutionKind: "completed_execution" | "official_scheduled_announcement";
  verificationMethod: "deterministic_completed_operational_text_v1" | "deterministic_scheduled_announcement_v1";
};

export function verifiedResetResolution(input: {
  text: string;
  signal: StructuredSignal;
  storedConfidence: number;
  storedRequiresReview: boolean;
}): VerifiedResetResolution | null {
  const confidence = Math.min(input.signal.extractionConfidence, input.storedConfidence);
  if (input.storedRequiresReview || input.signal.requiresReview || confidence < .9 || input.signal.sourceAuthority !== "monitored_official") return null;

  if (input.signal.signalType === "reset_confirmation"
    && input.signal.resetConfirmed
    && (input.signal.resetType === "full" || input.signal.resetType === "banked")
    && hasExplicitCompletedOperationalReset(input.text)) {
    return {
      resetType: input.signal.resetType,
      resolutionKind: "completed_execution",
      verificationMethod: "deterministic_completed_operational_text_v1",
    };
  }

  if (input.signal.signalType === "near_term_reset_commitment"
    && input.signal.resetType === "scheduled"
    && input.signal.resetIntentStrength >= .8
    && (input.signal.timeImmediacy === "high" || input.signal.timeImmediacy === "immediate")
    && hasExplicitScheduledOperationalResetAnnouncement(input.text)) {
    return {
      resetType: "scheduled",
      resolutionKind: "official_scheduled_announcement",
      verificationMethod: "deterministic_scheduled_announcement_v1",
    };
  }

  return null;
}
