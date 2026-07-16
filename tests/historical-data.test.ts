import { describe, expect, it } from "vitest";
import { extractMilestoneUsers, historicalDatasetSummary, historicalSeedResetHistory, importHistoricalSeeds, loadHistoricalDatasets, sourceManifestSchema, type HistoricalDatasets, type KnownResetSeedRow } from "@/lib/historical-data";

describe("human-verified historical seeds", () => {
  it("loads all three version-controlled files with strict schemas", () => {
    const datasets = loadHistoricalDatasets();
    expect(datasets.manifest.policy).toBe("human-verified-only");
    expect(datasets.ledger.policy).toBe("human-verified-only");
    expect(datasets.windows.policy).toBe("human-verified-only");
    expect(() => sourceManifestSchema.parse({ ...datasets.manifest, generatedByLlm: true })).toThrow();
  });

  it("builds stable UUID upserts so repeated imports are idempotent", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000010";
    const resetId = "00000000-0000-4000-8000-000000000011";
    const provenance = { method: "manual_verification" as const, observedBy: "dataset curator", observedAt: "2026-07-16T00:00:00.000Z", notes: "Manually reviewed source." };
    const datasets: HistoricalDatasets = {
      manifest: { schemaVersion: "1.0.0", datasetVersion: "test-1", policy: "human-verified-only", sources: [{ id: sourceId, sourceUrl: "https://x.com/i/status/1", sourcePostId: "1", sourceAccount: "@thsottiaux", sourceType: "official_x_announcement", sourceExcerpt: "Verified source excerpt", observedAt: provenance.observedAt, eventAt: provenance.observedAt, eventCategory: "explicit_reset_confirmation", verificationStatus: "verified", verificationNotes: "Reviewed", notes: "Test source", observationWindow: "positive", dataProvenance: provenance }] },
      ledger: { schemaVersion: "1.0.0", datasetVersion: "test-1", policy: "human-verified-only", records: [{ id: resetId, sourceManifestId: sourceId, sourceUrl: "https://x.com/i/status/1", sourcePostId: "1", canonicalId: "test-3m", milestoneUsers: 3_000_000, displayDateThailand: "2026-07-16", secondarySourceUrls: [], sourceExcerpt: "Verified source excerpt", observedAt: provenance.observedAt, eventAt: provenance.observedAt, eventCategory: "milestone", resetType: "full", description: "Verified 3M test reset", verificationStatus: "verified", verificationNotes: "Reviewed", observationWindow: "positive", dataProvenance: provenance }] },
      windows: { schemaVersion: "1.0.0", datasetVersion: "test-1", policy: "human-verified-only", windows: [] },
    };
    const rows = new Map<string, KnownResetSeedRow>();
    const repository = { upsertKnownResetEvents: async (incoming: KnownResetSeedRow[]) => { let inserted = 0; let duplicateRecordsSkipped = 0; for (const row of incoming) { if (rows.has(row.id)) duplicateRecordsSkipped += 1; else inserted += 1; rows.set(row.id, row); } return { inserted, updated: 0, duplicateRecordsSkipped }; } };
    const first = await importHistoricalSeeds(repository, datasets);
    const second = await importHistoricalSeeds(repository, datasets);
    expect(rows.size).toBe(1);
    expect(rows.get(resetId)?.source_platform_post_id).toBe("1");
    expect(first.recordsInserted).toBe(1);
    expect(second.duplicateRecordsSkipped).toBe(1);
  });

  it("derives milestone presentation only from verified seed text", () => {
    expect(extractMilestoneUsers("9M users milestone")).toBe(9_000_000);
    expect(extractMilestoneUsers("Reached 9 million users")).toBe(9_000_000);
    expect(extractMilestoneUsers("No supported milestone here")).toBeUndefined();
  });

  it("loads only the supplied 3M through 9M canonical announcements", () => {
    const datasets = loadHistoricalDatasets();
    const summary = historicalDatasetSummary();
    expect(summary.confirmedResets).toBe(7);
    expect(summary.milestoneResets).toBe(7);
    expect(summary.latestMilestoneUsers).toBe(9_000_000);
    expect(summary.negativeWindows).toBe(0);
    expect(summary.recordsAvailable).toBe(true);
    expect(historicalSeedResetHistory().map(item => item.milestoneUsers).sort()).toEqual([3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000]);
    expect(historicalSeedResetHistory().find(item => item.milestoneUsers === 5_000_000)?.type).toBe("scheduled");
    expect(historicalSeedResetHistory().find(item => item.milestoneUsers === 7_000_000)?.type).toBe("banked");
    expect(datasets.manifest.sources).toHaveLength(8);
    expect(datasets.manifest.sources.every(source => source.sourceAccount.startsWith("@") && source.sourceType.startsWith("official_x_"))).toBe(true);
    expect(datasets.windows.windows).toHaveLength(7);
    expect(datasets.windows.windows.every(window => window.observationWindow === "positive" && window.forecastBefore === null && window.forecastAfter === null && window.resetFollowedWithinHorizon === null)).toBe(true);
    expect(datasets.ledger.records.some(record => record.milestoneUsers < 3_000_000)).toBe(false);
  });
});
