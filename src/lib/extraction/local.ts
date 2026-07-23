import { parseMilestoneSignal } from "@/lib/milestones";
import type { Extraction } from "./schema";
import { classifyResetPolicyLanguage, enforceExtractionSafety, hasCredibleOperationalResetCommitment, hasExplicitCompletedOperationalReset, hasExplicitScheduledOperationalResetAnnouncement } from "./safety";

const interventionPattern = /\b(?:let me see what i can do|i(?:['’])?ll see what i can do|let me look into it|i will look into this|working on it|i(?:['’])?ll check|let me fix that|see what we can do|leave it with me)\b/i;
const interventionContextPattern = /\b(?:codex|chatgpt work|usage|quota|weekly limit|rate limit|tokens?|capacity|access|availability|reset|anthropic)\b|@(?:openai|anthropicai|maxedapps)\b/i;

export function localExtract(text: string): Extraction {
  const lower = text.toLowerCase();
  const milestone = parseMilestoneSignal(text);
  const poll = /\?|\bpoll\b/.test(lower);
  const capacity = /capacity|overload|demand/.test(lower);
  const incident = /incident|degraded|outage/.test(lower);
  const policyLanguage = classifyResetPolicyLanguage(text);
  const resetMorphology = /\breset(?:s|ting)?\b|\b(?:reset\s+again|another\s+reset|more\s+resets?|future\s+resets?)\b/i.test(text);
  const resetHint = resetMorphology || /\b(tokens? flow|limit refresh)\b/.test(lower);
  const operatorIntervention = interventionPattern.test(text) && interventionContextPattern.test(text);
  const explicitOperationalReset = /\b(?:usage|weekly|rate)\s*limits?\s+(?:have|has|were|are)\s+(?:been\s+)?(?:reset|restored|refreshed)\b|\b(?:usage|quota)\s+(?:has|have|was|were)\s+(?:reset|restored|refreshed)\b/i.test(text);
  const explicitReset = milestone?.resetType === "full" || milestone?.resetType === "banked" || explicitOperationalReset || hasExplicitCompletedOperationalReset(text);
  const scheduledAnnouncement = hasExplicitScheduledOperationalResetAnnouncement(text);
  const credibleCommitment = hasCredibleOperationalResetCommitment(text);
  const negative = policyLanguage === "withdrawal" || /\b(?:cannot|can(?:['’])t|won(?:['’])t|no reset|delayed|cancelled|canceled|not resetting)\b/i.test(text);
  const relevant = Boolean(milestone || resetHint || incident || capacity || poll || operatorIntervention || negative || policyLanguage);
  let eventType: Extraction["event_type"] = "irrelevant";
  if (explicitReset) eventType = "explicit_reset_confirmation";
  else if (milestone?.resetType === "scheduled") eventType = "milestone_commitment";
  else if (milestone) eventType = "milestone_progress";
  else if (resetHint) eventType = "reset_hint";
  else if (incident) eventType = "usage_incident";
  else if (capacity) eventType = "capacity_signal";
  else if (negative || operatorIntervention || policyLanguage) eventType = "general_codex_update";
  else if (poll) eventType = "community_poll";
  const ambiguous = Boolean(milestone?.ambiguous || (poll && resetHint) || policyLanguage === "ambiguous");
  const policyContinuation = policyLanguage === "continuation";
  const extraction: Extraction = {
    is_relevant: relevant,
    relevance_reason: policyContinuation ? "Official reset-policy continuation language detected (heuristic)" : policyLanguage === "withdrawal" ? "Official reset-policy withdrawal language detected (heuristic)" : relevant ? "Deterministic keyword and milestone pattern match (heuristic)" : "No configured reset signal found",
    event_type: policyLanguage ? "general_codex_update" : eventType,
    reset_mentioned: explicitReset || resetHint || Boolean(milestone && milestone.resetType !== "announcement_only"),
    reset_confirmed: explicitReset && !ambiguous,
    commitment_strength: explicitReset ? .95 : scheduledAnnouncement ? .95 : policyContinuation ? .85 : milestone?.resetType === "scheduled" ? .85 : credibleCommitment ? .85 : resetHint ? .55 : 0,
    milestone_target: null,
    milestone_current: milestone?.reportedActiveUsers ?? null,
    milestone_denominator: milestone?.denominator ?? "unknown",
    incident_strength: incident ? .7 : 0,
    capacity_concern: capacity ? .7 : 0,
    promotional_signal: /promo|bonus|free/.test(lower) ? .7 : 0,
    time_reference: milestone?.resetType === "scheduled" || scheduledAnnouncement || /tomorrow|soon|next/.test(lower) ? "near_future" : policyContinuation ? "future_unspecified" : relevant ? "current" : "none",
    reset_type: explicitReset ? milestone?.resetType ?? "unknown" : scheduledAnnouncement ? "scheduled" : milestone?.resetType ?? (resetHint ? "unknown" : "none"),
    evidence_quotes: relevant ? [text.slice(0, 160)] : [],
    uncertainties: ambiguous ? ["Ambiguous, playful, conditional, quoted, or interrogative wording requires review."] : policyContinuation ? ["The statement establishes continuing policy but provides no timing for the next reset."] : relevant ? ["Heuristic extraction; final structured extraction may refine this event."] : [],
    extraction_confidence: explicitReset && !ambiguous ? .96 : scheduledAnnouncement ? .96 : policyContinuation ? .92 : milestone && !ambiguous ? .9 : relevant ? .65 : .9,
    requires_review: relevant && (ambiguous || (!milestone && !explicitReset && !credibleCommitment && !operatorIntervention && !negative && !policyContinuation)),
    signal_type: explicitReset ? "reset_confirmation" : scheduledAnnouncement ? "near_term_reset_commitment" : policyLanguage === "withdrawal" ? "negative_or_delaying_signal" : policyLanguage ? "reset_policy_continuation" : operatorIntervention ? "operator_intervention" : milestone?.resetType === "scheduled" ? "milestone_commitment" : milestone ? "milestone_progress" : resetHint ? "reset_hint" : incident ? "operational_work_underway" : relevant ? "general_update" : "irrelevant",
    operational_relevance: explicitReset || milestone || policyContinuation ? "high" : operatorIntervention || incident || negative || policyLanguage === "ambiguous" ? "moderate" : relevant ? "low" : "none",
    reset_intent_strength: explicitReset ? 1 : scheduledAnnouncement ? .95 : policyContinuation ? .9 : policyLanguage === "withdrawal" ? 1 : credibleCommitment ? .85 : resetHint ? .55 : operatorIntervention ? .15 : 0,
    operator_intervention_strength: operatorIntervention ? .62 : 0,
    time_immediacy: explicitReset || (scheduledAnnouncement && /\bnext\s+(?:(?:\d+|an?|one)\s+)?(?:minutes?|hours?)\b/i.test(text)) ? "immediate" : milestone?.resetType === "scheduled" || scheduledAnnouncement || credibleCommitment ? "high" : operatorIntervention || incident ? "moderate" : relevant ? "low" : "none",
    source_authority: "monitored_official",
    policy_scope: policyLanguage ? "ongoing" : "none",
    policy_persistence: policyContinuation ? "active" : policyLanguage === "ambiguous" ? "uncertain" : policyLanguage === "withdrawal" ? "withdrawn" : "none",
  };
  return enforceExtractionSafety(text, extraction);
}
