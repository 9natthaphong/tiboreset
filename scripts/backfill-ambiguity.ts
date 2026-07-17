import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { evaluateAmbiguityCandidate } from "../src/lib/extraction/ambiguity-backfill";
import { forecastFromEvidence, type Evidence } from "../src/lib/forecasting";
import { MODEL_CONFIG } from "../src/lib/forecasting/model-config";
import { versionedForecastContext } from "../src/lib/forecast-context";
import { extractMilestoneUsers } from "../src/lib/historical-data";
import { MILESTONE_TARGET_POLICY } from "../src/lib/milestones";
import type { ForecastContext } from "../src/lib/forecasting";

loadEnvConfig(process.cwd());

const eventSchema = z.object({ id: z.string().uuid(), source_post_id: z.string().uuid(), requires_review: z.boolean().nullable(), event_payload: z.record(z.string(), z.unknown()) });
const postSchema = z.object({ id: z.string().uuid(), platform_post_id: z.string(), text: z.string(), post_url: z.string().nullable(), posted_at: z.string() });
const latestForecastSchema = z.object({ id: z.string().uuid(), probability: z.coerce.number(), evidence_post_ids: z.array(z.string()) });

function fail(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function loadEvidence(client: SupabaseClient): Promise<Evidence[]> {
  const postsResult = await client.from("source_posts").select("id,platform_post_id,text,post_url,posted_at").eq("platform", "x").eq("is_relevant", true).order("posted_at", { ascending: true }).limit(500);
  fail(postsResult.error, "Unable to load corrected source evidence");
  const posts = z.array(postSchema).parse(postsResult.data ?? []);
  if (!posts.length) return [];
  const eventsResult = await client.from("extracted_events").select("id,source_post_id,event_type,event_payload,extraction_confidence,requires_review").in("source_post_id", posts.map(post => post.id)).eq("requires_review", false).order("created_at", { ascending: false });
  fail(eventsResult.error, "Unable to load corrected extracted evidence");
  const events = z.array(z.object({ id: z.string().uuid(), source_post_id: z.string().uuid(), event_type: z.string(), event_payload: z.record(z.string(), z.unknown()), extraction_confidence: z.coerce.number(), requires_review: z.literal(false) })).parse(eventsResult.data ?? []);
  const byPost = new Map<string, (typeof events)[number]>();
  for (const event of events) if (!byPost.has(event.source_post_id)) byPost.set(event.source_post_id, event);
  return posts.flatMap(post => {
    const event = byPost.get(post.id);
    if (!event) return [];
    const numberValue = (key: string) => typeof event.event_payload[key] === "number" ? Number(event.event_payload[key]) : 0;
    const nullableNumber = (key: string) => typeof event.event_payload[key] === "number" ? Number(event.event_payload[key]) : null;
    return [{ id: event.id, postId: post.id, postedAt: post.posted_at, excerpt: post.text, eventType: event.event_type as Evidence["eventType"], confidence: event.extraction_confidence, verified: true, sourceType: "official_x" as const, url: post.post_url ?? `https://x.com/i/status/${post.platform_post_id}`, effect: numberValue("forecastImpact"), commitmentStrength: numberValue("commitment_strength"), milestoneCurrent: nullableNumber("milestone_current"), milestoneTarget: nullableNumber("milestone_target"), incidentStrength: numberValue("incident_strength"), capacityConcern: numberValue("capacity_concern"), promotionalSignal: numberValue("promotional_signal") }];
  });
}

async function saveForecast(client: SupabaseClient, forecast: ReturnType<typeof forecastFromEvidence>): Promise<string> {
  const modelResult = await client.from("forecast_models").upsert({ name: MODEL_CONFIG.name, version: MODEL_CONFIG.version, configuration: MODEL_CONFIG, active: true }, { onConflict: "version" }).select("id").single();
  fail(modelResult.error, "Unable to resolve forecast model");
  const forecastResult = await client.from("forecasts").insert({ forecast_model_id: modelResult.data!.id, generated_at: forecast.generatedAt, horizon_hours: forecast.horizonHours, probability: forecast.probability, credible_interval_low: forecast.credibleIntervalLow, credible_interval_high: forecast.credibleIntervalHigh, predicted_window_start: forecast.predictedWindowStart, predicted_window_end: forecast.predictedWindowEnd, data_cutoff: forecast.dataCutoff, feature_snapshot: forecast.features, simulation_summary: { ...forecast.simulation, configurationHash: forecast.configurationHash, featureOrigins: forecast.featureOrigins, featureDetails: forecast.featureDetails, correctionReason: "ambiguity_safety_backfill" }, evidence_post_ids: forecast.sourcePostIds, mode: "live" }).select("id").single();
  fail(forecastResult.error, "Unable to save corrected forecast");
  const forecastId = String(forecastResult.data!.id);
  if (forecast.contributions.length) {
    const contributions = await client.from("forecast_feature_contributions").insert(forecast.contributions.map(item => ({ forecast_id: forecastId, feature_name: item.featureName, normalized_value: item.normalizedValue, coefficient: item.coefficient, log_odds_contribution: item.logOddsContribution, evidence: { sourcePostIds: forecast.sourcePostIds, correctionReason: "ambiguity_safety_backfill" } })));
    fail(contributions.error, "Unable to save corrected forecast contributions");
  }
  return forecastId;
}

async function loadForecastContext(client: SupabaseClient, cutoff: string): Promise<ForecastContext> {
  const base = versionedForecastContext(cutoff);
  const [resetResult, milestoneResult] = await Promise.all([
    client.from("known_reset_events").select("occurred_at,reset_type,reason_category,description,verified").eq("verified", true).lte("occurred_at", cutoff).order("occurred_at", { ascending: true }),
    client.from("milestone_events").select("reported_active_users,announced_at,verification_status").eq("verification_status", "verified").lte("announced_at", cutoff).order("announced_at", { ascending: true }),
  ]);
  fail(resetResult.error, "Unable to load verified reset context");
  fail(milestoneResult.error, "Unable to load verified milestone context");
  const milestoneRows = milestoneResult.data ?? [];
  const latestUsers = milestoneRows.reduce((max, row) => Math.max(max, Number(row.reported_active_users)), 0);
  return {
    ...base,
    verifiedResets: (resetResult.data ?? []).filter(row => row.reset_type !== "scheduled").map(row => ({ occurredAt: String(row.occurred_at), milestoneUsers: extractMilestoneUsers(typeof row.reason_category === "string" ? row.reason_category : undefined, typeof row.description === "string" ? row.description : undefined), verified: row.verified === true })),
    milestoneObservations: milestoneRows.length ? milestoneRows.map(row => ({ occurredAt: String(row.announced_at), milestoneUsers: Number(row.reported_active_users), verified: true })) : base.milestoneObservations,
    nextPledgedMilestoneUsers: latestUsers >= MILESTONE_TARGET_POLICY.finalPledgedTargetUsers ? null : base.nextPledgedMilestoneUsers,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are unavailable");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const latestResult = await client.from("forecasts").select("id,probability,evidence_post_ids").order("generated_at", { ascending: false }).limit(1).maybeSingle();
  fail(latestResult.error, "Unable to read current forecast");
  const previous = latestResult.data ? latestForecastSchema.parse(latestResult.data) : null;

  const eventsResult = await client.from("extracted_events").select("id,source_post_id,requires_review,event_payload").in("event_type", ["reset_hint", "explicit_reset_confirmation", "milestone_commitment", "community_poll"]).order("created_at", { ascending: true }).limit(500);
  fail(eventsResult.error, "Unable to inspect reset-related extraction records");
  const events = z.array(eventSchema).parse(eventsResult.data ?? []);
  const sourceIds = [...new Set(events.map(event => event.source_post_id))];
  const postsResult = sourceIds.length ? await client.from("source_posts").select("id,platform_post_id,text,post_url,posted_at").in("id", sourceIds) : { data: [], error: null };
  fail(postsResult.error, "Unable to resolve reset-related source posts");
  const posts = z.array(postSchema).parse(postsResult.data ?? []);
  const byId = new Map(posts.map(post => [post.id, post]));

  let inspected = 0;
  let changed = 0;
  const affectedPostIds = new Set<string>();
  const affectedSourceIds = new Set<string>();
  for (const event of events) {
    const post = byId.get(event.source_post_id);
    if (!post) continue;
    inspected += 1;
    const evaluation = evaluateAmbiguityCandidate({ text: post.text, requiresReview: event.requires_review, eventPayload: event.event_payload });
    if (!evaluation.violatesSafetyRule) continue;
    affectedPostIds.add(post.platform_post_id);
    affectedSourceIds.add(post.id);
    if (!evaluation.needsUpdate) continue;
    const update = await client.from("extracted_events").update({ requires_review: true, event_payload: evaluation.correctedPayload }).eq("id", event.id);
    fail(update.error, `Unable to correct extraction ${event.id}`);
    changed += 1;
  }

  const latestIncludesAffected = previous?.evidence_post_ids.some(id => affectedSourceIds.has(id)) ?? false;
  let correctedProbability: number | null = previous?.probability ?? null;
  let newForecastId: string | null = null;
  if (changed > 0 || latestIncludesAffected) {
    const cutoff = new Date().toISOString();
    const evidence = await loadEvidence(client);
    const context = await loadForecastContext(client, cutoff);
    const forecast = forecastFromEvidence(evidence, cutoff, Number(process.env.FORECAST_HORIZON_HOURS ?? 36), undefined, undefined, context);
    newForecastId = await saveForecast(client, forecast);
    correctedProbability = forecast.probability;
  }

  console.log({ recordsInspected: inspected, recordsChanged: changed, affectedPlatformPostIds: [...affectedPostIds], previousForecastProbability: previous ? Math.round(previous.probability * 100) : null, correctedForecastProbability: correctedProbability === null ? null : Math.round(correctedProbability * 100), newForecastId });
}

void main().catch(error => {
  console.error({ ok: false, error: error instanceof Error ? error.message : "Ambiguity backfill failed" });
  process.exitCode = 1;
});
