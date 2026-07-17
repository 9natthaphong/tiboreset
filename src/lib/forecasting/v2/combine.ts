export const combineIndependentRisks = (policy: number, discretionary: number) => 1 - (1 - policy) * (1 - discretionary);

export function applyEvidenceOverride(probability: number, input: { confirmed: boolean; directCommitmentConfidence: number }) {
  if (input.confirmed) return Math.max(.98, probability);
  if (input.directCommitmentConfidence > 0) return Math.max(probability, .8 + .15 * Math.min(1, input.directCommitmentConfidence));
  return probability;
}

export function policyAlertBand(probability: number) {
  if (probability >= .98) return "CONFIRMED" as const;
  if (probability >= .8) return "IMMINENT" as const;
  if (probability >= .6) return "HIGH" as const;
  if (probability >= .4) return "ELEVATED" as const;
  if (probability >= .2) return "WATCH" as const;
  return "LOW" as const;
}
