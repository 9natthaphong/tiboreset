import { z } from "zod";

export const eventTypes = [
  "explicit_reset_confirmation", "reset_hint", "milestone_commitment", "milestone_progress", "usage_incident",
  "capacity_signal", "limit_policy_change", "product_launch", "promotion", "community_poll", "general_codex_update", "irrelevant",
] as const;

export const structuredSignalTypes = [
  "irrelevant", "general_update", "operator_intervention", "operational_work_underway", "reset_hint",
  "milestone_progress", "milestone_commitment", "limit_policy_change", "reset_policy_continuation", "near_term_reset_commitment",
  "reset_confirmation", "negative_or_delaying_signal",
] as const;

export const ExtractionSchema = z.object({
  is_relevant: z.boolean(),
  relevance_reason: z.string(),
  event_type: z.enum(eventTypes),
  reset_mentioned: z.boolean(),
  reset_confirmed: z.boolean(),
  commitment_strength: z.number().min(0).max(1),
  milestone_target: z.number().int().nullable(),
  milestone_current: z.number().int().nullable(),
  milestone_denominator: z.enum(["codex_only", "codex_and_chatgpt_work", "unknown"]),
  incident_strength: z.number().min(0).max(1),
  capacity_concern: z.number().min(0).max(1),
  promotional_signal: z.number().min(0).max(1),
  time_reference: z.enum(["past", "current", "near_future", "future_unspecified", "none"]),
  reset_type: z.enum(["full", "banked", "scheduled", "announcement_only", "temporary_limit_change", "unknown", "none"]),
  evidence_quotes: z.array(z.string().max(180)),
  uncertainties: z.array(z.string()),
  extraction_confidence: z.number().min(0).max(1),
  requires_review: z.boolean(),
  signal_type: z.enum(structuredSignalTypes),
  operational_relevance: z.enum(["none", "low", "moderate", "high"]),
  reset_intent_strength: z.number().min(0).max(1),
  operator_intervention_strength: z.number().min(0).max(1),
  time_immediacy: z.enum(["none", "low", "moderate", "high", "immediate"]),
  source_authority: z.enum(["monitored_official", "official", "unknown"]),
  policy_scope: z.enum(["none", "ongoing"]),
  policy_persistence: z.enum(["none", "active", "uncertain", "withdrawn"]),
}).strict();

export const ExtractionJsonSchema = z.toJSONSchema(ExtractionSchema, { target: "draft-7" });
export type Extraction = z.infer<typeof ExtractionSchema>;
