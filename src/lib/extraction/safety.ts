import type { Extraction } from "./schema";

const playfulPattern = /\b(joke|joking|kidding|lol|lmao|stole|stolen|reset button|you(?:['’]?re| are) welcome)\b/i;
const uncertainPattern = /\b(maybe|might|could|perhaps|possibly|hopefully)\b/i;
const conditionalPattern = /(^|[.!?]\s*)\s*(if|unless)\b|\bwould\s+(?:reset|restore|refresh)\b/i;
const questionPattern = /\?|\b(?:will|would|could|can)\s+(?:you|we|they)\s+(?:reset|restore|refresh)\b/i;
const policyQuestionPattern = /\b(?:will|would|could|can)\s+(?:the\s+)?resets?\s+(?:continue|keep|return|happen)\b/i;
const policyUncertaintyPattern = /\b(?:i\s+(?:do\s+not|don['’]t)\s+know|not\s+sure|unclear|whether)\b/i;
const quotedPolicyPattern = /["“][^"”]*\bresets?\b[^"”]*["”]/i;
const operationalObjectPattern = /\b(?:usage|weekly|rate)?\s*limits?\b|\bquota\b|\busage\b/i;
const commitmentPattern = /\b(?:we|i)\s+(?:will|shall|plan to|intend to|are going to)\s+(?:reset|restore|refresh)\b|\b(?:usage|weekly|rate)\s*limits?\s+(?:will|shall|are going to)\s+be\s+(?:reset|restored|refreshed)\b/i;
const futureResetPattern = /\b(?:will|tomorrow|soon|scheduled|plan(?:ned)?|going to|later)\b/i;
const completedResetPattern = /\b(?:usage|weekly|rate)\s*limits?\s+(?:have|has|were|are|have now|are now)\s+(?:been\s+)?(?:reset|restored|refreshed)\b|\b(?:usage|quota|limits?)\s+(?:has|have|was|were)\s+(?:been\s+)?(?:reset|restored|refreshed)\b|\b(?:reset|banked reset)\s+(?:was|has been|is now)?\s*(?:added|granted|issued|completed|restored)\b|\benjoy\s+(?:the\s+)?reset\s+(?:usage|weekly|rate)?\s*limits?\b|\bwe\s+(?:have\s+)?(?:reset|restored|refreshed)\s+(?:usage|weekly|rate)?\s*limits?\b/i;
const policyWithdrawalPattern = /\b(?:no\s+more\s+resets?|resets?\s+(?:will|are)\s+not\s+continue|resets?\s+are\s+stopping|stop\s+(?:the\s+)?resets?|cancel(?:led|ed)?\s+(?:the\s+)?resets?)\b/i;
const policyContinuationPattern = /\b(?:the\s+)?resets?\s+(?:will\s+continue|are\s+continuing|continue(?:s)?|are\s+not\s+stopping)\b|\b(?:keep\s+(?:the\s+)?resets?\s+coming|continue\s+(?:the\s+)?resets?|continue\s+resetting|there\s+will\s+be\s+more\s+resets?|future\s+resets?|more\s+resets?)\b/i;

export function hasAmbiguousResetLanguage(text: string): boolean {
  return playfulPattern.test(text) || uncertainPattern.test(text) || conditionalPattern.test(text) || questionPattern.test(text) || policyQuestionPattern.test(text) || policyUncertaintyPattern.test(text) || quotedPolicyPattern.test(text);
}

export function classifyResetPolicyLanguage(text: string): "continuation" | "withdrawal" | "ambiguous" | null {
  if (policyWithdrawalPattern.test(text)) return "withdrawal";
  if (!policyContinuationPattern.test(text)) return null;
  return hasAmbiguousResetLanguage(text) ? "ambiguous" : "continuation";
}

export function hasCredibleOperationalResetCommitment(text: string): boolean {
  return !hasAmbiguousResetLanguage(text) && operationalObjectPattern.test(text) && commitmentPattern.test(text);
}

export function hasExplicitCompletedOperationalReset(text: string): boolean {
  return !hasAmbiguousResetLanguage(text) && !futureResetPattern.test(text) && completedResetPattern.test(text);
}

export function enforceExtractionSafety(text: string, extraction: Extraction): Extraction {
  const unsafeHint = extraction.event_type === "reset_hint" && !hasCredibleOperationalResetCommitment(text);
  const policy = classifyResetPolicyLanguage(text);
  const ambiguous = hasAmbiguousResetLanguage(text);
  if (!unsafeHint && !ambiguous) return extraction;
  return {
    ...extraction,
    reset_confirmed: false,
    commitment_strength: unsafeHint && policy !== "ambiguous" ? 0 : extraction.commitment_strength,
    requires_review: true,
    policy_persistence: policy === "ambiguous" ? "uncertain" : extraction.policy_persistence,
    uncertainties: Array.from(new Set([...extraction.uncertainties, "Ambiguous, playful, conditional, quoted, or interrogative reset wording requires review before it can affect the forecast."])),
  };
}
