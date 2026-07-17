import manifestJson from "@/data/source-manifest.json";
import ledgerJson from "@/data/verified-reset-ledger.json";
import windowsJson from "@/data/historical-signal-windows.json";
import {
  historicalSignalWindowsSchema,
  sourceManifestSchema,
  verifiedResetLedgerSchema,
  type HistoricalSignalWindows,
  type SourceManifest,
  type VerifiedResetLedger,
} from "./schema";

export type HistoricalDatasets = {
  manifest: SourceManifest;
  ledger: VerifiedResetLedger;
  windows: HistoricalSignalWindows;
};

export function extractMilestoneUsers(...values: Array<string | null | undefined>): number | undefined {
  const text = values.filter(Boolean).join(" ");
  const compact = text.match(/\b(\d+(?:\.\d+)?)\s*m(?:illion)?\s*(?:users?)?\b/i);
  if (compact) return Math.round(Number(compact[1]) * 1_000_000);
  const expanded = text.match(/\b(\d+(?:,\d{3})+)\s*(?:users?)?\b/i);
  if (expanded) return Number(expanded[1].replaceAll(",", ""));
  return undefined;
}

export function historicalDatasetSummary(datasets = loadHistoricalDatasets()) {
  const verifiedRecords = datasets.ledger.records.filter(record => record.verificationStatus === "verified");
  const milestoneValues = verifiedRecords
    .map(record => record.milestoneUsers)
    .filter((value): value is number => value !== undefined);
  const positiveWindows = datasets.windows.windows.filter(window => window.observationWindow === "positive").length;
  const negativeWindows = datasets.windows.windows.filter(window => window.observationWindow === "negative").length;
  const verifiedSources = datasets.manifest.sources.filter(source => source.verificationStatus === "verified").length;
  const latestMilestoneUsers = milestoneValues.length ? Math.max(...milestoneValues) : null;
  return {
    datasetVersion: datasets.ledger.datasetVersion,
    confirmedResets: verifiedRecords.length,
    milestoneResets: milestoneValues.length,
    latestMilestoneUsers,
    latestMilestoneLabel: latestMilestoneUsers ? `${latestMilestoneUsers / 1_000_000}M users` : null,
    negativeWindows,
    positiveWindows,
    verifiedSources,
    totalSources: datasets.manifest.sources.length,
    recordsAvailable: verifiedRecords.length > 0 || datasets.windows.windows.length > 0 || datasets.manifest.sources.length > 0,
  };
}

export function historicalSeedResetHistory(datasets = loadHistoricalDatasets()) {
  const normalized = new Map(buildMilestoneSeedRows(datasets).map(event => [event.sourcePostId, event]));
  const records = datasets.ledger.records
    .filter(record => record.verificationStatus === "verified")
    .sort((a, b) => Date.parse(b.eventAt) - Date.parse(a.eventAt));
  return records.map((record, index) => ({
    id: record.id,
    date: record.eventAt,
    type: record.resetType,
    reason: record.eventCategory,
    description: record.description,
    sourceUrl: record.sourceUrl,
    included: false,
    timeSincePreviousDays: records[index + 1]
      ? Math.round((Date.parse(record.eventAt) - Date.parse(records[index + 1].eventAt)) / 86_400_000)
      : undefined,
    milestoneUsers: record.milestoneUsers,
    displayDateThailand: record.displayDateThailand,
    verificationBadge: "official_announcement" as const,
    sourceAccount: "@thsottiaux",
    verificationStatus: record.verificationStatus,
    historicalSource: "seed" as const,
    sourcePostId: record.sourcePostId ?? undefined,
    denominator: record.sourcePostId ? normalized.get(record.sourcePostId)?.denominator : "unknown" as const,
  }));
}

export function loadHistoricalDatasets(): HistoricalDatasets {
  const manifest = sourceManifestSchema.parse(manifestJson);
  const ledger = verifiedResetLedgerSchema.parse(ledgerJson);
  const windows = historicalSignalWindowsSchema.parse(windowsJson);
  const sourceIds = new Set(manifest.sources.map(source => source.id));
  for (const record of ledger.records) {
    if (!sourceIds.has(record.sourceManifestId)) throw new Error(`Unknown source manifest reference: ${record.sourceManifestId}`);
  }
  for (const window of windows.windows) {
    for (const sourceId of window.sourceManifestIds) {
      if (!sourceIds.has(sourceId)) throw new Error(`Unknown source manifest reference: ${sourceId}`);
    }
  }
  return { manifest, ledger, windows };
}

export type KnownResetSeedRow = {
  id: string;
  occurred_at: string;
  reset_type: string;
  reason_category: string;
  description: string;
  source_platform_post_id: string | null;
  verified: boolean;
  verification_notes: string;
};

export function buildKnownResetSeedRows(datasets = loadHistoricalDatasets()): KnownResetSeedRow[] {
  return datasets.ledger.records.map(record => ({
    id: record.id,
    occurred_at: record.eventAt,
    reset_type: record.resetType,
    reason_category: record.eventCategory,
    description: record.description,
    source_platform_post_id: record.sourcePostId,
    verified: record.verificationStatus === "verified",
    verification_notes: `canonical_id=${record.canonicalId} | source_post_id=${record.sourcePostId ?? "none"} | ${record.verificationNotes} | provenance=${record.dataProvenance.method} | source=${record.sourceUrl} | observed=${record.observedAt} | window=${record.observationWindow}`,
  }));
}

export type HistoricalSeedWriteReport = {
  inserted: number;
  updated: number;
  duplicateRecordsSkipped: number;
};

export interface HistoricalSeedRepository {
  upsertKnownResetEvents(rows: KnownResetSeedRow[]): Promise<HistoricalSeedWriteReport>;
  upsertMilestoneEvents?(rows: import("@/lib/milestones").MilestoneEvent[]): Promise<HistoricalSeedWriteReport>;
}

export function buildMilestoneSeedRows(datasets = loadHistoricalDatasets()): import("@/lib/milestones").MilestoneEvent[] {
  const sourceById = new Map(datasets.manifest.sources.map(source => [source.id, source]));
  return datasets.ledger.records.filter(record => record.verificationStatus === "verified" && record.sourcePostId).map(record => {
    const source = sourceById.get(record.sourceManifestId);
    const combined = /chatgpt\s+work/i.test(`${record.description} ${source?.sourceExcerpt ?? ""}`);
    const codex = /\bcodex\b/i.test(`${record.description} ${source?.sourceExcerpt ?? ""}`);
    return {
      sourcePostId: record.sourcePostId!, sourceUrl: record.sourceUrl, sourceAccount: source?.sourceAccount ?? "@thsottiaux",
      reportedActiveUsers: record.milestoneUsers, denominator: combined ? "codex_and_chatgpt_work" : codex ? "codex_only" : "unknown",
      resetType: record.resetType === "banked" ? "banked" : record.resetType === "scheduled" ? "scheduled" : "full",
      announcedAt: record.eventAt, executionAt: record.resetType === "scheduled" ? null : record.eventAt,
      verificationStatus: "verified", verificationMethod: `historical_seed:${datasets.ledger.datasetVersion}`, rejectionReason: null,
    };
  });
}

export async function importHistoricalSeeds(repository: HistoricalSeedRepository, datasets = loadHistoricalDatasets()) {
  const parsedRows = buildKnownResetSeedRows(datasets);
  const rows = parsedRows.filter(row => row.verified);
  const rejected = parsedRows.length - rows.length;
  const writeReport = await repository.upsertKnownResetEvents(rows);
  if (repository.upsertMilestoneEvents) await repository.upsertMilestoneEvents(buildMilestoneSeedRows(datasets));
  return {
    datasetVersion: datasets.ledger.datasetVersion,
    ledgerRecords: datasets.ledger.records.length,
    signalWindows: datasets.windows.windows.length,
    sources: datasets.manifest.sources.length,
    recordsParsed: parsedRows.length,
    recordsInserted: writeReport.inserted,
    recordsUpdated: writeReport.updated,
    recordsRejected: rejected,
    duplicateRecordsSkipped: writeReport.duplicateRecordsSkipped,
  };
}

const knownEventTypes = new Set([
  "explicit_reset_confirmation", "reset_hint", "milestone_commitment", "milestone_progress", "usage_incident", "capacity_signal",
  "limit_policy_change", "product_launch", "promotion", "community_poll", "general_codex_update", "irrelevant",
]);

export function historicalEvidenceAtCutoff(cutoff: string, datasets = loadHistoricalDatasets()): import("@/lib/forecasting").Evidence[] {
  return datasets.windows.windows
    .filter(window => window.verificationStatus === "verified" && Date.parse(window.eventAt) <= Date.parse(cutoff))
    .map(window => ({
      id: window.id,
      postId: window.sourcePostId ?? window.id,
      postedAt: window.eventAt,
      excerpt: window.sourceExcerpt,
      eventType: (knownEventTypes.has(window.eventCategory) ? window.eventCategory : "general_codex_update") as import("@/lib/forecasting").EventType,
      confidence: 1,
      verified: true,
      sourceType: "official_x" as const,
      url: window.sourceUrl,
      effect: window.forecastBefore != null && window.forecastAfter != null ? Math.round((window.forecastAfter - window.forecastBefore) * 100) : 0,
    }));
}

export function verifiedResetOutcomes(datasets = loadHistoricalDatasets()) {
  return datasets.ledger.records
    .filter(record => record.verificationStatus === "verified")
    .map(record => ({ occurredAt: record.eventAt }));
}

export function historicalCalibrationRows(datasets = loadHistoricalDatasets()) {
  return datasets.windows.windows.flatMap(window => window.verificationStatus === "verified" && window.forecastBefore != null
    && window.resetFollowedWithinHorizon != null ? [{ probability: window.forecastBefore, outcome: window.resetFollowedWithinHorizon }]
    : []);
}

export function findHistoricalAnalogWindows(features: Record<string, number>, cutoff: string, datasets = loadHistoricalDatasets()) {
  const cosine = (candidate: Record<string, number>) => {
    const keys = [...new Set([...Object.keys(features), ...Object.keys(candidate)])];
    const dot = keys.reduce((sum, key) => sum + (features[key] ?? 0) * (candidate[key] ?? 0), 0);
    const a = Math.sqrt(keys.reduce((sum, key) => sum + (features[key] ?? 0) ** 2, 0));
    const b = Math.sqrt(keys.reduce((sum, key) => sum + (candidate[key] ?? 0) ** 2, 0));
    return a && b ? dot / (a * b) : 0;
  };
  return datasets.windows.windows
    .filter(window => window.verificationStatus === "verified" && Date.parse(window.eventAt) <= Date.parse(cutoff))
    .map(window => ({ ...window, similarity: cosine(window.featureVector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

export * from "./schema";
