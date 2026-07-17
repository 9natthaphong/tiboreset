import { z } from "zod";

export const externalContextCategorySchema = z.enum([
  "openai_status_incident",
  "openai_codex_release",
  "openai_promotion",
  "competitor_limit_increase",
  "competitor_free_access",
  "competitor_coding_launch",
]);

export const externalContextEventSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  category: externalContextCategorySchema,
  title: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["official_provider_announcement", "official_status_page", "manual_review"]),
  verificationStatus: z.enum(["reviewed", "unverified", "rejected"]),
  description: z.string().min(1),
  forecastWeight: z.number().min(-1).max(1),
  rationale: z.string().min(1),
}).strict().superRefine((event, context) => {
  if (event.category.startsWith("competitor_") && event.forecastWeight !== 0) context.addIssue({ code: "custom", path: ["forecastWeight"], message: "Competitor context must have zero forecast weight until calibrated." });
  if (event.category.startsWith("competitor_") && event.rationale !== "Context only; no calibrated causal relationship.") context.addIssue({ code: "custom", path: ["rationale"], message: "Competitor context must carry the reviewed context-only rationale." });
});

export const externalContextDatasetSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  datasetVersion: z.string().min(1),
  policy: z.literal("human-reviewed-official-sources-only"),
  events: z.array(externalContextEventSchema),
}).strict();

export type ExternalContextEvent = z.infer<typeof externalContextEventSchema>;
export type ExternalContextDataset = z.infer<typeof externalContextDatasetSchema>;
