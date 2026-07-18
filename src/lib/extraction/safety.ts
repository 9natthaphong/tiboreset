import type { Extraction } from "./schema";

const playfulPattern = /\b(joke|joking|kidding|lol|lmao|stole|stolen|reset button|you(?:'|’)re welcome)\b/i;
const uncertainPattern = /\b(maybe|might|could|perhaps|possibly|hopefully)\b/i;
const conditionalPattern = /(^|[.!?]\s*)\s*(if|unless)\b|\bwould\s+(?:reset|restore|refresh)\b/i;
const questionPattern = /\?|\b(?:will|would|could|can)\s+(?:you|we|they)\s+(?:reset|restore|refresh)\b/i;
const operationalObjectPattern = /\b(?:usage|weekly|rate)?\s*limits?\b|\bquota\b|\busage\b/i;
const commitmentPattern = /\b(?:we|i)\s+(?:will|shall|plan to|intend to|are going to)\s+(?:reset|restore|refresh)\b|\b(?:usage|weekly|rate)\s*limits?\s+(?:will|shall|are going to)\s+be\s+(?:reset|restored|refreshed)\b/i;
const futureResetPattern = /\b(?:will|tomorrow|soon|scheduled|plan(?:ned)?|going to|later)\b/i;
const completedResetPattern = /\b(?:usage|weekly|rate)\s*limits?\s+(?:have|has|were|are|have now|are now)\s+(?:been\s+)?(?:reset|restored|refreshed)\b|\b(?:usage|quota|limits?)\s+(?:has|have|was|were)\s+(?:been\s+)?(?:reset|restored|refreshed)\b|\b(?:reset|banked reset)\s+(?:was|has been|is now)?\s*(?:added|granted|issued|completed|restored)\b|\benjoy\s+(?:the\s+)?reset\s+(?:usage|weekly|rate)?\s*limits?\b|\bwe\s+(?:have\s+)?(?:reset|restored|refreshed)\s+(?:usage|weekly|rate)?\s*limits?\b/i;

export function hasAmbiguousResetLanguage(text: string): boolean {
  return playfulPattern.test(text) || uncertainPattern.test(text) || conditionalPattern.test(text) || questionPattern.test(text);
}

export function hasCredibleOperationalResetCommitment(text: string): boolean {
  return !hasAmbiguousResetLanguage(text) && operationalObjectPattern.test(text) && commitmentPattern.test(text);
}

export function hasExplicitCompletedOperationalReset(text: string): boolean {
  return !hasAmbiguousResetLanguage(text) && !futureResetPattern.test(text) && completedResetPattern.test(text);
}

export function enforceExtractionSafety(text: string, extraction: Extraction): Extraction {
  const unsafeHint = extraction.event_type === "reset_hint" && !hasCredibleOperationalResetCommitment(text);
  const ambiguous = hasAmbiguousResetLanguage(text);
  if (!unsafeHint && !ambiguous) return extraction;
  return {
    ...extraction,
    reset_confirmed: false,
    commitment_strength: unsafeHint ? 0 : extraction.commitment_strength,
    requires_review: true,
    uncertainties: Array.from(new Set([...extraction.uncertainties, "Ambiguous, playful, conditional, or interrogative reset wording requires review before it can affect the forecast."])),
  };
}
