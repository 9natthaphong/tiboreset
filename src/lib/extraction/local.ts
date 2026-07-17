import { parseMilestoneSignal } from "@/lib/milestones";
import type { Extraction } from "./schema";
import { enforceExtractionSafety, hasCredibleOperationalResetCommitment } from "./safety";

export function localExtract(text: string): Extraction {
  const lower = text.toLowerCase();
  const milestone = parseMilestoneSignal(text);
  const poll = /\?|\bpoll\b/.test(lower);
  const capacity = /capacity|overload|demand/.test(lower);
  const incident = /incident|degraded|outage/.test(lower);
  const resetHint = /\b(reset|tokens? flow|limit refresh)\b/.test(lower);
  const explicitOperationalReset = /\b(?:usage|weekly|rate)\s*limits?\s+(?:have|has|were|are)\s+(?:been\s+)?(?:reset|restored|refreshed)\b|\b(?:usage|quota)\s+(?:has|have|was|were)\s+(?:reset|restored|refreshed)\b/i.test(text);
  const explicitReset = milestone?.resetType === "full" || milestone?.resetType === "banked" || explicitOperationalReset;
  const credibleCommitment = hasCredibleOperationalResetCommitment(text);
  const relevant = Boolean(milestone || resetHint || incident || capacity || poll);
  let eventType: Extraction["event_type"] = "irrelevant";
  if (explicitReset) eventType = "explicit_reset_confirmation";
  else if (milestone?.resetType === "scheduled") eventType = "milestone_commitment";
  else if (milestone) eventType = "milestone_progress";
  else if (resetHint) eventType = "reset_hint";
  else if (incident) eventType = "usage_incident";
  else if (capacity) eventType = "capacity_signal";
  else if (poll) eventType = "community_poll";
  const ambiguous = Boolean(milestone?.ambiguous || (poll && resetHint));
  const extraction: Extraction = {
    is_relevant: relevant,
    relevance_reason: relevant ? "Deterministic keyword and milestone pattern match (heuristic)" : "No configured reset signal found",
    event_type: eventType,
    reset_mentioned: explicitReset || resetHint || Boolean(milestone && milestone.resetType !== "announcement_only"),
    reset_confirmed: explicitReset && !ambiguous,
    commitment_strength: explicitReset ? 0.95 : milestone?.resetType === "scheduled" ? 0.85 : credibleCommitment ? 0.85 : resetHint ? 0.55 : 0,
    milestone_target: null,
    milestone_current: milestone?.reportedActiveUsers ?? null,
    milestone_denominator: milestone?.denominator ?? "unknown",
    incident_strength: incident ? 0.7 : 0,
    capacity_concern: capacity ? 0.7 : 0,
    promotional_signal: /promo|bonus|free/.test(lower) ? 0.7 : 0,
    time_reference: milestone?.resetType === "scheduled" || /tomorrow|soon|next/.test(lower) ? "near_future" : relevant ? "current" : "none",
    reset_type: milestone?.resetType ?? (resetHint ? "unknown" : "none"),
    evidence_quotes: relevant ? [text.slice(0, 160)] : [],
    uncertainties: ambiguous ? ["Ambiguous, playful, conditional, or interrogative wording requires review."] : relevant ? ["Heuristic extraction; final structured extraction may refine this event."] : [],
    extraction_confidence: explicitReset && !ambiguous ? 0.96 : milestone && !ambiguous ? 0.9 : relevant ? 0.65 : 0.9,
    requires_review: relevant && (ambiguous || (!milestone && !explicitReset && !credibleCommitment)),
  };
  return enforceExtractionSafety(text, extraction);
}
