import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoricalSeedRepository, KnownResetSeedRow } from "./index";

function throwOnError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export class SupabaseHistoricalSeedRepository implements HistoricalSeedRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsertKnownResetEvents(rows: KnownResetSeedRow[]) {
    if (!rows.length) return { inserted: 0, updated: 0, duplicateRecordsSkipped: 0 };
    const uniqueRows: KnownResetSeedRow[] = [];
    const seenIds = new Set<string>();
    const seenSourcePostIds = new Set<string>();
    let duplicateRecordsSkipped = 0;
    for (const row of rows) {
      if (seenIds.has(row.id) || (row.source_platform_post_id && seenSourcePostIds.has(row.source_platform_post_id))) {
        duplicateRecordsSkipped += 1;
        continue;
      }
      seenIds.add(row.id);
      if (row.source_platform_post_id) seenSourcePostIds.add(row.source_platform_post_id);
      uniqueRows.push(row);
    }

    const platformIds = uniqueRows.flatMap(row => row.source_platform_post_id ? [row.source_platform_post_id] : []);
    const sourceResult = platformIds.length
      ? await this.client.from("source_posts").select("id,platform_post_id").eq("platform", "x").in("platform_post_id", platformIds)
      : { data: [], error: null };
    throwOnError(sourceResult.error, "Unable to resolve reset seed sources");
    const sourceIds = new Map((sourceResult.data ?? []).map(row => [String(row.platform_post_id), String(row.id)]));
    const payloads = uniqueRows.map(row => ({
      id: row.id,
      occurred_at: row.occurred_at,
      reset_type: row.reset_type,
      reason_category: row.reason_category,
      description: row.description,
      source_post_id: row.source_platform_post_id ? sourceIds.get(row.source_platform_post_id) ?? null : null,
      verified: row.verified,
      verification_notes: row.verification_notes,
    }));

    const existingResult = await this.client.from("known_reset_events").select("id,occurred_at,reset_type,reason_category,description,source_post_id,verified,verification_notes").in("id", payloads.map(row => row.id));
    throwOnError(existingResult.error, "Unable to inspect existing reset ledger");
    const existingById = new Map((existingResult.data ?? []).map(row => [String(row.id), row]));
    const changed = payloads.filter(payload => {
      const existing = existingById.get(payload.id);
      if (!existing) return true;
      const same = Date.parse(String(existing.occurred_at)) === Date.parse(payload.occurred_at)
        && existing.reset_type === payload.reset_type
        && existing.reason_category === payload.reason_category
        && existing.description === payload.description
        && (existing.source_post_id ?? null) === payload.source_post_id
        && existing.verified === payload.verified
        && existing.verification_notes === payload.verification_notes;
      if (same) duplicateRecordsSkipped += 1;
      return !same;
    });

    if (changed.length) {
      const result = await this.client.from("known_reset_events").upsert(changed, { onConflict: "id" });
      throwOnError(result.error, "Unable to import verified reset ledger");
    }
    return {
      inserted: changed.filter(row => !existingById.has(row.id)).length,
      updated: changed.filter(row => existingById.has(row.id)).length,
      duplicateRecordsSkipped,
    };
  }
}
