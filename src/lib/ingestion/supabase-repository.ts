import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Extraction } from "@/lib/extraction/schema";
import { MODEL_CONFIG } from "@/lib/forecasting/model-config";
import type { Evidence, Forecast, ForecastContext } from "@/lib/forecasting";
import { extractMilestoneUsers, type KnownResetSeedRow, type HistoricalSeedRepository } from "@/lib/historical-data";
import { versionedForecastContext } from "@/lib/forecast-context";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ExtractionResult, IngestionReport, IngestionRepository, StoredAccount, StoredExtraction, StoredPost } from "./types";
import type { SocialAccount, SocialPost } from "@/lib/social/adapters";
import { MILESTONE_TARGET_POLICY, type MilestoneEvent } from "@/lib/milestones";

const accountSchema = z.object({ id: z.string().uuid(), platform_user_id: z.string(), username: z.string(), display_name: z.string().nullable(), profile_image_url: z.string().nullable(), latest_processed_post_id: z.string().nullable() });
const postRowSchema = z.object({ id: z.string().uuid(), platform_post_id: z.string(), text: z.string(), post_url: z.string().nullable(), posted_at: z.string() });
const eventRowSchema = z.object({ id: z.string().uuid(), source_post_id: z.string().uuid(), event_type: z.string(), event_payload: z.record(z.string(), z.unknown()), extraction_confidence: z.coerce.number(), requires_review: z.boolean().nullable() });

function throwOnError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function publicMetrics(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || !("public_metrics" in raw)) return {};
  const metrics = (raw as { public_metrics?: unknown }).public_metrics;
  if (!metrics || typeof metrics !== "object") return {};
  return Object.fromEntries(Object.entries(metrics).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function extractionPayload(result: ExtractionResult, forecastImpact: number) {
  return {
    ...result.extraction,
    forecastImpact,
    extractionSource: result.source,
    fallbackUsed: result.source === "local_fallback",
    fallbackReason: result.fallbackReason ?? null,
    schemaVersion: "reset-event-schema-1.1.0",
  };
}

function stableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

export class SupabaseIngestionRepository implements IngestionRepository, HistoricalSeedRepository {
  constructor(private client: SupabaseClient = getServiceSupabase()) {}

  async startRun(input: { source: "x"; startedAt: string }) {
    const result = await this.client.from("ingestion_runs").insert({ source: input.source, started_at: input.startedAt, status: "running", metadata: { boundedFetchLimit: 10 } }).select("id").single();
    throwOnError(result.error, "Unable to start ingestion run");
    return String(result.data!.id);
  }

  async completeRun(runId: string, report: IngestionReport) {
    const result = await this.client.from("ingestion_runs").update({
      completed_at: report.completedAt,
      status: "success",
      posts_read: report.postsRead,
      posts_inserted: report.postsInserted,
      posts_analyzed: report.postsAnalyzed,
      metadata: {
        durationMs: report.durationMs,
        accountResolved: report.accountResolved,
        forecastChanged: report.forecastChanged,
        forecastId: report.forecastId,
        xResourcesConsumed: report.xResourcesConsumed,
        boundedFetchLimit: 10,
      },
    }).eq("id", runId);
    throwOnError(result.error, "Unable to complete ingestion run");
  }

  async failRun(runId: string, input: { completedAt: string; durationMs: number; safeError: string; postsRead: number; postsInserted: number; postsAnalyzed: number; xResourcesConsumed: number }) {
    const result = await this.client.from("ingestion_runs").update({
      completed_at: input.completedAt,
      status: "failure",
      posts_read: input.postsRead,
      posts_inserted: input.postsInserted,
      posts_analyzed: input.postsAnalyzed,
      error_message: input.safeError,
      metadata: { durationMs: input.durationMs, xResourcesConsumed: input.xResourcesConsumed, boundedFetchLimit: 10 },
    }).eq("id", runId);
    throwOnError(result.error, "Unable to record ingestion failure");
  }

  async findAccount(username: string): Promise<StoredAccount | null> {
    const result = await this.client.from("monitored_accounts").select("id,platform_user_id,username,display_name,profile_image_url,latest_processed_post_id").eq("platform", "x").eq("username", username).eq("enabled", true).maybeSingle();
    throwOnError(result.error, "Unable to read monitored account");
    if (!result.data) return null;
    const row = accountSchema.parse(result.data);
    return { databaseId: row.id, id: row.platform_user_id, username: row.username, displayName: row.display_name ?? row.username, profileImageUrl: row.profile_image_url ?? undefined, latestProcessedPostId: row.latest_processed_post_id ?? undefined };
  }

  async upsertAccount(account: SocialAccount): Promise<StoredAccount> {
    const result = await this.client.from("monitored_accounts").upsert({
      platform: "x",
      platform_user_id: account.id,
      username: account.username,
      display_name: account.displayName,
      profile_image_url: account.profileImageUrl ?? null,
      enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "platform,platform_user_id" }).select("id,platform_user_id,username,display_name,profile_image_url,latest_processed_post_id").single();
    throwOnError(result.error, "Unable to upsert monitored account");
    const row = accountSchema.parse(result.data);
    return { databaseId: row.id, id: row.platform_user_id, username: row.username, displayName: row.display_name ?? row.username, profileImageUrl: row.profile_image_url ?? undefined, latestProcessedPostId: row.latest_processed_post_id ?? undefined };
  }

  async findExistingPostIds(platformPostIds: string[]) {
    if (!platformPostIds.length) return new Set<string>();
    const result = await this.client.from("source_posts").select("platform_post_id").eq("platform", "x").in("platform_post_id", platformPostIds);
    throwOnError(result.error, "Unable to check existing source posts");
    return new Set((result.data ?? []).map(row => String(row.platform_post_id)));
  }

  async insertPost(input: { account: StoredAccount; post: SocialPost; localScreen: Extraction }): Promise<StoredPost> {
    const payload = {
      monitored_account_id: input.account.databaseId,
      platform: "x",
      platform_post_id: input.post.id,
      text: input.post.text,
      post_url: input.post.url,
      posted_at: input.post.createdAt,
      raw_payload: input.post.raw,
      public_metrics: publicMetrics(input.post.raw),
      is_relevant: input.localScreen.is_relevant,
      relevance_reason: input.localScreen.relevance_reason,
      approved_public: true,
    };
    const result = await this.client.from("source_posts").upsert(payload, { onConflict: "platform,platform_post_id", ignoreDuplicates: true }).select("id,platform_post_id").maybeSingle();
    throwOnError(result.error, "Unable to insert source post");
    if (result.data) return { databaseId: String(result.data.id), platformPostId: String(result.data.platform_post_id) };
    const existing = await this.client.from("source_posts").select("id,platform_post_id").eq("platform", "x").eq("platform_post_id", input.post.id).single();
    throwOnError(existing.error, "Unable to read deduplicated source post");
    return { databaseId: String(existing.data!.id), platformPostId: String(existing.data!.platform_post_id) };
  }

  async insertExtraction(input: { post: StoredPost; result: ExtractionResult; forecastImpact: number }): Promise<StoredExtraction> {
    const extraction = input.result.extraction;
    const postUpdate = await this.client.from("source_posts").update({ is_relevant: extraction.is_relevant, relevance_reason: extraction.relevance_reason }).eq("id", input.post.databaseId);
    throwOnError(postUpdate.error, "Unable to update final post relevance");
    const result = await this.client.from("extracted_events").insert({
      source_post_id: input.post.databaseId,
      extraction_version: input.result.extractionVersion,
      event_type: extraction.event_type,
      event_payload: extractionPayload(input.result, input.forecastImpact),
      extraction_confidence: extraction.extraction_confidence,
      requires_review: extraction.requires_review,
    }).select("id").single();
    throwOnError(result.error, "Unable to insert extracted event");
    return { databaseId: String(result.data!.id) };
  }

  async getLatestVerifiedMilestoneUsers(): Promise<number | null> {
    const result = await this.client.from("milestone_events").select("reported_active_users").eq("verification_status", "verified").order("reported_active_users", { ascending: false }).limit(1).maybeSingle();
    if (result.error?.message?.includes("milestone_events")) return null;
    throwOnError(result.error, "Unable to read latest verified milestone");
    return result.data ? Number(result.data.reported_active_users) : null;
  }

  async upsertMilestoneCandidate(input: { candidate: MilestoneEvent; post: StoredPost }): Promise<void> {
    const candidate = input.candidate;
    const result = await this.client.from("milestone_events").upsert({
      source_post_id: candidate.sourcePostId,
      source_url: candidate.sourceUrl,
      source_account: candidate.sourceAccount,
      reported_active_users: candidate.reportedActiveUsers,
      denominator: candidate.denominator,
      reset_type: candidate.resetType,
      announced_at: candidate.announcedAt,
      execution_at: candidate.executionAt,
      verification_status: candidate.verificationStatus,
      verification_method: candidate.verificationMethod,
      rejection_reason: candidate.rejectionReason,
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_post_id", ignoreDuplicates: true });
    throwOnError(result.error, "Unable to persist milestone candidate");
    if (candidate.verificationStatus !== "verified" || candidate.resetType === "announcement_only") return;
    const reset = await this.client.from("known_reset_events").upsert({
      id: stableUuid(`milestone:${candidate.sourcePostId}`),
      occurred_at: candidate.executionAt ?? candidate.announcedAt,
      reset_type: candidate.resetType,
      reason_category: "user_milestone",
      description: `${candidate.reportedActiveUsers / 1_000_000}M ${candidate.denominator.replaceAll("_", " ")} milestone: ${candidate.resetType} reset announcement.`,
      source_post_id: input.post.databaseId,
      verified: true,
      verification_notes: `source_post_id=${candidate.sourcePostId} | method=${candidate.verificationMethod}`,
    }, { onConflict: "id" });
    throwOnError(reset.error, "Unable to synchronize verified milestone reset");
  }

  async loadForecastEvidence(): Promise<Evidence[]> {
    const postResult = await this.client.from("source_posts").select("id,platform_post_id,text,post_url,posted_at").eq("platform", "x").eq("is_relevant", true).order("posted_at", { ascending: true }).limit(500);
    throwOnError(postResult.error, "Unable to load forecast source posts");
    const posts = z.array(postRowSchema).parse(postResult.data ?? []);
    if (!posts.length) return [];
    const eventResult = await this.client.from("extracted_events").select("id,source_post_id,event_type,event_payload,extraction_confidence,requires_review").in("source_post_id", posts.map(post => post.id)).eq("requires_review", false).order("created_at", { ascending: false });
    throwOnError(eventResult.error, "Unable to load forecast events");
    const events = z.array(eventRowSchema).parse(eventResult.data ?? []);
    const byPost = new Map<string, z.infer<typeof eventRowSchema>>();
    for (const event of events) if (!byPost.has(event.source_post_id)) byPost.set(event.source_post_id, event);
    return posts.flatMap(post => {
      const event = byPost.get(post.id);
      if (!event) return [];
      const payload = event.event_payload;
      const numberOr = (key: string, fallback = 0) => typeof payload[key] === "number" ? payload[key] as number : fallback;
      const nullableNumber = (key: string) => typeof payload[key] === "number" ? payload[key] as number : null;
      return [{
        id: event.id,
        postId: post.id,
        postedAt: post.posted_at,
        excerpt: post.text,
        eventType: event.event_type as Evidence["eventType"],
        confidence: event.extraction_confidence,
        verified: event.requires_review === false,
        sourceType: "official_x",
        url: post.post_url ?? `https://x.com/i/status/${post.platform_post_id}`,
        effect: numberOr("forecastImpact"),
        commitmentStrength: numberOr("commitment_strength"),
        milestoneCurrent: nullableNumber("milestone_current"),
        milestoneTarget: nullableNumber("milestone_target"),
        incidentStrength: numberOr("incident_strength"),
        capacityConcern: numberOr("capacity_concern"),
        promotionalSignal: numberOr("promotional_signal"),
      } satisfies Evidence];
    });
  }

  async loadForecastContext(): Promise<ForecastContext> {
    const cutoff = new Date().toISOString();
    const base = versionedForecastContext(cutoff);
    const result = await this.client.from("known_reset_events").select("occurred_at,reset_type,reason_category,description,verified").eq("verified", true).lte("occurred_at", cutoff).order("occurred_at", { ascending: true });
    throwOnError(result.error, "Unable to load verified reset context");
    const milestoneResult = await this.client.from("milestone_events").select("reported_active_users,announced_at,reset_type,verification_status").eq("verification_status", "verified").lte("announced_at", cutoff).order("announced_at", { ascending: true });
    const milestoneRows = milestoneResult.error ? [] : milestoneResult.data ?? [];
    const latestUsers = milestoneRows.reduce((max, row) => Math.max(max, Number(row.reported_active_users)), 0);
    const nextTarget = latestUsers >= MILESTONE_TARGET_POLICY.finalPledgedTargetUsers ? null : base.nextPledgedMilestoneUsers;
    return {
      ...base,
      verifiedResets: (result.data ?? []).filter(row => row.reset_type !== "scheduled").map(row => {
        const occurredAt = String(row.occurred_at);
        const canonical = base.verifiedResets.find(reset => Date.parse(reset.occurredAt) === Date.parse(occurredAt));
        return {
          occurredAt,
          milestoneUsers: extractMilestoneUsers(typeof row.reason_category === "string" ? row.reason_category : undefined, typeof row.description === "string" ? row.description : undefined) ?? canonical?.milestoneUsers,
          verified: row.verified === true,
        };
      }),
      milestoneObservations: milestoneRows.length ? milestoneRows.map(row => ({ occurredAt: String(row.announced_at), milestoneUsers: Number(row.reported_active_users), verified: true })) : base.milestoneObservations,
      nextPledgedMilestoneUsers: nextTarget,
    };
  }

  async saveForecast(forecast: Forecast): Promise<string> {
    const modelResult = await this.client.from("forecast_models").upsert({ name: MODEL_CONFIG.name, version: MODEL_CONFIG.version, configuration: MODEL_CONFIG, active: true }, { onConflict: "version" }).select("id").single();
    throwOnError(modelResult.error, "Unable to upsert forecast model");
    const forecastResult = await this.client.from("forecasts").insert({
      forecast_model_id: modelResult.data!.id,
      generated_at: forecast.generatedAt,
      horizon_hours: forecast.horizonHours,
      probability: forecast.probability,
      credible_interval_low: forecast.credibleIntervalLow,
      credible_interval_high: forecast.credibleIntervalHigh,
      predicted_window_start: forecast.predictedWindowStart,
      predicted_window_end: forecast.predictedWindowEnd,
      data_cutoff: forecast.dataCutoff,
      feature_snapshot: forecast.features,
      simulation_summary: { ...forecast.simulation, configurationHash: forecast.configurationHash, featureOrigins: forecast.featureOrigins, featureDetails: forecast.featureDetails },
      evidence_post_ids: forecast.sourcePostIds,
      mode: "live",
    }).select("id").single();
    throwOnError(forecastResult.error, "Unable to insert forecast");
    const forecastId = String(forecastResult.data!.id);
    if (forecast.contributions.length) {
      const contributionResult = await this.client.from("forecast_feature_contributions").insert(forecast.contributions.map(contribution => ({
        forecast_id: forecastId,
        feature_name: contribution.featureName,
        normalized_value: contribution.normalizedValue,
        coefficient: contribution.coefficient,
        log_odds_contribution: contribution.logOddsContribution,
        evidence: { sourcePostIds: forecast.sourcePostIds },
      })));
      throwOnError(contributionResult.error, "Unable to insert forecast contributions");
    }
    return forecastId;
  }

  async updateLatestProcessedPostId(accountId: string, platformPostId: string, updatedAt: string) {
    const result = await this.client.from("monitored_accounts").update({ latest_processed_post_id: platformPostId, updated_at: updatedAt }).eq("id", accountId);
    throwOnError(result.error, "Unable to update ingestion cursor");
  }

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
    const sourceResult = platformIds.length ? await this.client.from("source_posts").select("id,platform_post_id").eq("platform", "x").in("platform_post_id", platformIds) : { data: [], error: null };
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

  async upsertMilestoneEvents(rows: MilestoneEvent[]) {
    if (!rows.length) return { inserted: 0, updated: 0, duplicateRecordsSkipped: 0 };
    const existing = await this.client.from("milestone_events").select("source_post_id").in("source_post_id", rows.map(row => row.sourcePostId));
    throwOnError(existing.error, "Unable to inspect milestone seed ledger");
    const ids = new Set((existing.data ?? []).map(row => String(row.source_post_id)));
    const result = await this.client.from("milestone_events").upsert(rows.map(candidate => ({ source_post_id: candidate.sourcePostId, source_url: candidate.sourceUrl, source_account: candidate.sourceAccount, reported_active_users: candidate.reportedActiveUsers, denominator: candidate.denominator, reset_type: candidate.resetType, announced_at: candidate.announcedAt, execution_at: candidate.executionAt, verification_status: candidate.verificationStatus, verification_method: candidate.verificationMethod, rejection_reason: candidate.rejectionReason, updated_at: new Date().toISOString() })), { onConflict: "source_post_id" });
    throwOnError(result.error, "Unable to import milestone seed ledger");
    return { inserted: rows.filter(row => !ids.has(row.sourcePostId)).length, updated: rows.filter(row => ids.has(row.sourcePostId)).length, duplicateRecordsSkipped: 0 };
  }
}
