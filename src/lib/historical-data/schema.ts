import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });
const verificationStatus = z.enum(["verified", "unverified", "rejected"]);
const observationWindow = z.enum(["positive", "negative"]);
const resetType = z.enum(["full", "banked", "scheduled", "temporary_limit_change", "unknown", "none"]);
const thaiDisplayDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const provenanceSchema = z.object({
  method: z.enum(["manual_verification", "official_archive", "operator_import"]),
  observedBy: z.string().min(1),
  observedAt: isoTimestamp,
  notes: z.string().min(1),
}).strict();

export const sourceManifestSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  datasetVersion: z.string().min(1),
  policy: z.literal("human-verified-only"),
  sources: z.array(z.object({
    id: z.string().uuid(),
    sourceUrl: z.string().url(),
    sourcePostId: z.string().min(1).nullable(),
    sourceAccount: z.string().min(1),
    sourceType: z.enum(["official_x_announcement", "official_x_secondary"]),
    sourceExcerpt: z.string().min(1).max(500),
    observedAt: isoTimestamp,
    eventAt: isoTimestamp,
    eventCategory: z.string().min(1),
    verificationStatus,
    verificationNotes: z.string().min(1),
    notes: z.string().min(1),
    observationWindow,
    dataProvenance: provenanceSchema,
  }).strict()),
}).strict();

export const verifiedResetLedgerSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  datasetVersion: z.string().min(1),
  policy: z.literal("human-verified-only"),
  records: z.array(z.object({
    id: z.string().uuid(),
    sourceManifestId: z.string().uuid(),
    sourceUrl: z.string().url(),
    sourcePostId: z.string().min(1).nullable(),
    canonicalId: z.string().min(1),
    milestoneUsers: z.number().int().positive(),
    displayDateThailand: thaiDisplayDate,
    secondarySourceUrls: z.array(z.string().url()),
    sourceExcerpt: z.string().min(1).max(500),
    observedAt: isoTimestamp,
    eventAt: isoTimestamp,
    eventCategory: z.string().min(1),
    resetType: resetType.exclude(["none"]),
    description: z.string().min(1),
    verificationStatus,
    verificationNotes: z.string().min(1),
    observationWindow,
    dataProvenance: provenanceSchema,
  }).strict()),
}).strict();

export const historicalSignalWindowsSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  datasetVersion: z.string().min(1),
  policy: z.literal("human-verified-only"),
  windows: z.array(z.object({
    id: z.string().uuid(),
    sourceManifestIds: z.array(z.string().uuid()).min(1),
    sourceUrl: z.string().url(),
    sourcePostId: z.string().min(1).nullable(),
    sourceExcerpt: z.string().min(1).max(500),
    observedAt: isoTimestamp,
    eventAt: isoTimestamp,
    cutoffAt: isoTimestamp,
    eventCategory: z.string().min(1),
    resetType,
    verificationStatus,
    verificationNotes: z.string().min(1),
    observationWindow,
    resetFollowedWithinHorizon: z.boolean().nullable(),
    horizonHours: z.number().int().positive().max(720),
    featureVector: z.record(z.string(), z.number().finite()),
    forecastBefore: z.number().min(0).max(1).nullable(),
    forecastAfter: z.number().min(0).max(1).nullable(),
    modelVersion: z.string().min(1),
    dataProvenance: provenanceSchema,
  }).strict()),
}).strict();

export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type VerifiedResetLedger = z.infer<typeof verifiedResetLedgerSchema>;
export type HistoricalSignalWindows = z.infer<typeof historicalSignalWindowsSchema>;
