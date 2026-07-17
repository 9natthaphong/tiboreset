import "server-only";

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import demo from "@/data/demo.json";
import { currentForecast, state } from "@/lib/demo-store";
import { MODEL_CONFIG } from "@/lib/forecasting/model-config";
import { defaultFeatureOrigin, type Contribution, type Evidence, type EventType, type FeatureName, type FeatureOrigins, type Features, type Forecast, type SimulationSummary } from "@/lib/forecasting";
import { createDemoLatestPosts, parseLatestPostsLimit } from "@/lib/latest-posts";
import { getEmailConfigurationStatus } from "@/lib/notifications/email-config";
import { loadExternalContextEvents } from "@/lib/external-context";
import { extractMilestoneUsers, historicalDatasetSummary, historicalSeedResetHistory } from "@/lib/historical-data";
import type { HistoryPoint, LatestPost, LatestPostsResponse, PublicHealth, PublicMode, PublicSnapshot, ResetHistoryItem } from "@/lib/public-data-types";

const eventTypes = ["explicit_reset_confirmation","reset_hint","milestone_commitment","milestone_progress","usage_incident","capacity_signal","limit_policy_change","product_launch","promotion","community_poll","general_codex_update","irrelevant"] as const;
const eventTypeSchema = z.enum(eventTypes);
const metricsSchema = z.object({
  like_count: z.coerce.number().int().nonnegative().optional(),
  retweet_count: z.coerce.number().int().nonnegative().optional(),
  reply_count: z.coerce.number().int().nonnegative().optional(),
}).passthrough();

const sourcePostSchema = z.object({
  id: z.string(), platform_post_id: z.string(), text: z.string(), post_url: z.string().nullable(), posted_at: z.string(),
  public_metrics: metricsSchema.nullish(), is_relevant: z.boolean().nullable(), ingested_at: z.string().nullable(),
});
const extractedEventSchema = z.object({
  id: z.string(), source_post_id: z.string(), event_type: eventTypeSchema, extraction_confidence: z.coerce.number().min(0).max(1).nullable(),
  requires_review: z.boolean().nullable(), event_payload: z.record(z.string(), z.unknown()), created_at: z.string(),
});
const forecastRowSchema = z.object({
  id: z.string(), forecast_model_id: z.string().nullable(), generated_at: z.string(), horizon_hours: z.coerce.number().int().positive(),
  probability: z.coerce.number().min(0).max(1), credible_interval_low: z.coerce.number().min(0).max(1), credible_interval_high: z.coerce.number().min(0).max(1),
  predicted_window_start: z.string().nullable(), predicted_window_end: z.string().nullable(), data_cutoff: z.string(),
  feature_snapshot: z.record(z.string(), z.coerce.number()), simulation_summary: z.record(z.string(), z.unknown()), evidence_post_ids: z.array(z.string()), mode: z.enum(["demo","live"]).nullable(),
});
const contributionRowSchema = z.object({ feature_name: z.string(), normalized_value: z.coerce.number(), coefficient: z.coerce.number(), log_odds_contribution: z.coerce.number() });

function configuredMode(): PublicMode {
  return process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo";
}

function serverClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export { parseLatestPostsLimit } from "@/lib/latest-posts";

function demoPosts(limit: number): LatestPostsResponse {
  return createDemoLatestPosts(state().evidence, currentForecast().dataCutoff, limit);
}

function demoHistory(): HistoryPoint[] {
  const evidence = state().evidence;
  return state().forecasts.map((forecast, index) => {
    const item = evidence[Math.min(index, evidence.length - 1)];
    const fixture = demo.history[index];
    return {
      forecastId: forecast.id,
      time: forecast.generatedAt,
      probability: Math.round(forecast.probability * 100),
      low: Math.round(forecast.credibleIntervalLow * 100),
      high: Math.round(forecast.credibleIntervalHigh * 100),
      label: fixture?.label ?? item?.eventType.replaceAll("_", " ") ?? "Forecast update",
      excerpt: item?.excerpt,
      eventType: item?.eventType,
      evidencePostId: item?.postId,
      verified: item?.verified,
      impact: item?.effect,
    };
  });
}

function demoResetHistory(): ResetHistoryItem[] {
  const seeded = historicalSeedResetHistory();
  if (seeded.length) return seeded;
  return demo.timeline.map(item => ({ ...item, timeSincePreviousDays: undefined, milestoneUsers: extractMilestoneUsers(item.reason, item.description), verificationStatus: "verified" as const, historicalSource: "demo" as const }));
}

function mergeVerifiedResetHistory(primary: ResetHistoryItem[], seeded = historicalSeedResetHistory()): ResetHistoryItem[] {
  const seen = new Set<string>();
  return [...seeded, ...primary]
    .filter(item => {
      const key = item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return item.verificationStatus !== "rejected";
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function demoHealth(): PublicHealth {
  const forecast = currentForecast();
  return { app: "ok", mode: "demo", database: "unavailable", xSource: process.env.X_BEARER_TOKEN ? "configured" : "unavailable", openAI: process.env.OPENAI_API_KEY ? "configured" : "unavailable", email: getEmailConfigurationStatus(), lastIngestionAt: forecast.dataCutoff, lastForecastAt: forecast.generatedAt };
}

async function livePosts(client: SupabaseClient, limit: number): Promise<LatestPostsResponse> {
  const username = process.env.X_USERNAME ?? "thsottiaux";
  const accountResult = await client.from("monitored_accounts").select("id").eq("platform", "x").eq("username", username).eq("enabled", true).maybeSingle();
  if (accountResult.error || !accountResult.data) throw new Error("account unavailable");
  const postResult = await client.from("source_posts").select("id,platform_post_id,text,post_url,posted_at,public_metrics,is_relevant,ingested_at").eq("monitored_account_id", accountResult.data.id).eq("approved_public", true).order("posted_at", { ascending: false }).limit(limit);
  if (postResult.error) throw new Error("posts unavailable");
  const rows = z.array(sourcePostSchema).parse(postResult.data ?? []);
  const ids = rows.map(row => row.id);
  const eventResult = ids.length ? await client.from("extracted_events").select("id,source_post_id,event_type,extraction_confidence,requires_review,event_payload,created_at").in("source_post_id", ids).order("created_at", { ascending: false }) : { data: [], error: null };
  if (eventResult.error) throw new Error("events unavailable");
  const events = z.array(extractedEventSchema).parse(eventResult.data ?? []);
  const newestEvent = new Map<string, z.infer<typeof extractedEventSchema>>();
  for (const event of events) if (!newestEvent.has(event.source_post_id)) newestEvent.set(event.source_post_id, event);
  const posts = rows.map<LatestPost>(row => {
    const event = newestEvent.get(row.id);
    const impact = event?.event_payload.forecastImpact ?? event?.event_payload.forecast_impact ?? 0;
    return {
      id: row.platform_post_id,
      text: row.text,
      url: row.post_url ?? `https://x.com/i/status/${row.platform_post_id}`,
      postedAt: row.posted_at,
      isRelevant: row.is_relevant ?? false,
      eventType: event?.event_type ?? "irrelevant",
      extractionConfidence: event?.extraction_confidence ?? 0,
      forecastImpact: typeof impact === "number" ? Math.round(impact) : 0,
      verified: event ? event.requires_review === false : false,
      ambiguous: event ? event.requires_review !== false : true,
      metrics: { likes: row.public_metrics?.like_count ?? 0, reposts: row.public_metrics?.retweet_count ?? 0, replies: row.public_metrics?.reply_count ?? 0 },
    };
  });
  return { mode: "live", lastUpdatedAt: rows[0]?.ingested_at ?? rows[0]?.posted_at ?? new Date(0).toISOString(), posts };
}

export async function getLatestPosts(limit = 6): Promise<LatestPostsResponse> {
  const parsedLimit = parseLatestPostsLimit(String(limit));
  const client = configuredMode() === "live" ? serverClient() : null;
  if (!client) return demoPosts(parsedLimit);
  try { return await livePosts(client, parsedLimit); } catch { return demoPosts(parsedLimit); }
}

function labelForFeature(featureName: string): string {
  return MODEL_CONFIG.coefficients[featureName as keyof typeof MODEL_CONFIG.coefficients]?.label ?? featureName.replaceAll("_", " ");
}

function featureOriginsFromSimulation(features: Features, simulation: Record<string, unknown>): FeatureOrigins {
  const stored = simulation.featureOrigins;
  if (stored && typeof stored === "object") return Object.fromEntries((Object.keys(features) as FeatureName[]).map(name => {
    const value = (stored as Record<string, unknown>)[name];
    return [name, value === "measured" || value === "derived" || value === "expert_prior" || value === "unavailable" ? value : defaultFeatureOrigin(name)];
  })) as FeatureOrigins;
  return Object.fromEntries((Object.keys(features) as FeatureName[]).map(name => {
    const inferred = defaultFeatureOrigin(name);
    return [name, inferred === "derived" ? "unavailable" : inferred];
  })) as FeatureOrigins;
}

function featureDetailsFromSimulation(features: Features, simulation: Record<string, unknown>) {
  const stored = simulation.featureDetails;
  return Object.fromEntries((Object.keys(features) as FeatureName[]).map(name => [name, stored && typeof stored === "object" && typeof (stored as Record<string, unknown>)[name] === "string" ? String((stored as Record<string, unknown>)[name]) : "Origin metadata predates this forecast snapshot."])) as Record<FeatureName, string>;
}

async function mapLiveForecast(client: SupabaseClient, raw: unknown): Promise<Forecast> {
  const row = forecastRowSchema.parse(raw);
  const [contributionResult, modelResult, eventResult] = await Promise.all([
    client.from("forecast_feature_contributions").select("feature_name,normalized_value,coefficient,log_odds_contribution").eq("forecast_id", row.id),
    row.forecast_model_id ? client.from("forecast_models").select("version,configuration").eq("id", row.forecast_model_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    row.evidence_post_ids.length ? client.from("extracted_events").select("id").in("source_post_id", row.evidence_post_ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (contributionResult.error) throw new Error("contributions unavailable");
  const contributionRows = z.array(contributionRowSchema).parse(contributionResult.data ?? []);
  const contributions: Contribution[] = contributionRows.map(item => ({ featureName: item.feature_name as Contribution["featureName"], label: labelForFeature(item.feature_name), normalizedValue: item.normalized_value, coefficient: item.coefficient, logOddsContribution: item.log_odds_contribution }));
  const modelVersion = typeof modelResult.data?.version === "string" ? modelResult.data.version : MODEL_CONFIG.version;
  const configurationHash = createHash("sha256").update(JSON.stringify(modelResult.data?.configuration ?? MODEL_CONFIG)).digest("hex").slice(0, 16);
  const generated = Date.parse(row.generated_at);
  const features = row.feature_snapshot as Features;
  return {
    id: row.id, generatedAt: row.generated_at, horizonHours: row.horizon_hours, probability: row.probability,
    credibleIntervalLow: row.credible_interval_low, credibleIntervalHigh: row.credible_interval_high,
    predictedWindowStart: row.predicted_window_start ?? new Date(generated + row.horizon_hours * .35 * 36e5).toISOString(),
    predictedWindowEnd: row.predicted_window_end ?? new Date(generated + row.horizon_hours * 36e5).toISOString(),
    dataCutoff: row.data_cutoff, features, featureOrigins: featureOriginsFromSimulation(features, row.simulation_summary), featureDetails: featureDetailsFromSimulation(features, row.simulation_summary), contributions,
    simulation: row.simulation_summary as unknown as SimulationSummary,
    evidenceIds: (eventResult.data ?? []).map(item => String(item.id)), sourcePostIds: row.evidence_post_ids,
    modelVersion, configurationHash, mode: "live",
  };
}

async function liveForecasts(client: SupabaseClient, limit = 80): Promise<Forecast[]> {
  const result = await client.from("forecasts").select("id,forecast_model_id,generated_at,horizon_hours,probability,credible_interval_low,credible_interval_high,predicted_window_start,predicted_window_end,data_cutoff,feature_snapshot,simulation_summary,evidence_post_ids,mode").order("generated_at", { ascending: false }).limit(limit);
  if (result.error || !result.data?.length) throw new Error("forecasts unavailable");
  return Promise.all(result.data.reverse().map(row => mapLiveForecast(client, row)));
}

async function liveEvidence(client: SupabaseClient, sourcePostIds: string[]): Promise<Evidence[]> {
  if (!sourcePostIds.length) return [];
  const [postResult, eventResult] = await Promise.all([
    client.from("source_posts").select("id,platform_post_id,text,post_url,posted_at,public_metrics,is_relevant,ingested_at").in("id", sourcePostIds).eq("approved_public", true),
    client.from("extracted_events").select("id,source_post_id,event_type,extraction_confidence,requires_review,event_payload,created_at").in("source_post_id", sourcePostIds).order("created_at", { ascending: false }),
  ]);
  if (postResult.error || eventResult.error) throw new Error("evidence unavailable");
  const posts = z.array(sourcePostSchema).parse(postResult.data ?? []);
  const events = z.array(extractedEventSchema).parse(eventResult.data ?? []);
  const bySource = new Map(events.map(event => [event.source_post_id, event]));
  return posts.map(post => {
    const event = bySource.get(post.id);
    const payload = event?.event_payload ?? {};
    const impact = payload.forecastImpact ?? payload.forecast_impact ?? 0;
    return { id: event?.id ?? `post-${post.id}`, postId: post.platform_post_id, postedAt: post.posted_at, excerpt: post.text, eventType: event?.event_type ?? "irrelevant", confidence: event?.extraction_confidence ?? 0, verified: event?.requires_review === false, sourceType: "official_x" as const, url: post.post_url ?? `https://x.com/i/status/${post.platform_post_id}`, effect: typeof impact === "number" ? Math.round(impact) : 0 };
  }).sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
}

function historyFromForecasts(forecasts: Forecast[], evidence: Evidence[]): HistoryPoint[] {
  return forecasts.map((forecast, index) => {
    const addedSourceId = forecast.sourcePostIds.find(id => !forecasts[index - 1]?.sourcePostIds.includes(id));
    const item = evidence.find(candidate => candidate.postId === addedSourceId) ?? evidence[Math.min(index, evidence.length - 1)];
    const previous = forecasts[index - 1];
    return { forecastId: forecast.id, time: forecast.generatedAt, probability: Math.round(forecast.probability * 100), low: Math.round(forecast.credibleIntervalLow * 100), high: Math.round(forecast.credibleIntervalHigh * 100), label: item?.eventType.replaceAll("_", " ") ?? "Forecast update", excerpt: item?.excerpt, eventType: item?.eventType, evidencePostId: item?.postId, verified: item?.verified, impact: previous ? Math.round((forecast.probability - previous.probability) * 100) : item?.effect };
  });
}

async function liveResetHistory(client: SupabaseClient): Promise<ResetHistoryItem[]> {
  const result = await client.from("known_reset_events").select("id,occurred_at,reset_type,reason_category,description,source_post_id").eq("verified", true).order("occurred_at", { ascending: false }).limit(20);
  if (result.error) throw new Error("reset history unavailable");
  const rows = z.array(z.object({ id: z.string(), occurred_at: z.string(), reset_type: z.string(), reason_category: z.string().nullable(), description: z.string(), source_post_id: z.string().nullable() })).parse(result.data ?? []);
  const sourceIds = rows.flatMap(row => row.source_post_id ? [row.source_post_id] : []);
  const sourceResult = sourceIds.length ? await client.from("source_posts").select("id,post_url").in("id", sourceIds).eq("approved_public", true) : { data: [], error: null };
  if (sourceResult.error) throw new Error("reset sources unavailable");
  const urls = new Map((sourceResult.data ?? []).map(item => [String(item.id), typeof item.post_url === "string" ? item.post_url : undefined]));
  return rows.map((row, index) => ({ id: row.id, date: row.occurred_at, type: row.reset_type, reason: row.reason_category ?? "Unspecified", description: row.description, sourceUrl: row.source_post_id ? urls.get(row.source_post_id) : undefined, included: true, timeSincePreviousDays: rows[index + 1] ? Math.round((Date.parse(row.occurred_at) - Date.parse(rows[index + 1].occurred_at)) / 864e5) : undefined, milestoneUsers: extractMilestoneUsers(row.reason_category, row.description), verificationStatus: "verified" as const, historicalSource: "live" as const }));
}

export async function getPublicHealth(): Promise<PublicHealth> {
  const mode = configuredMode();
  const client = mode === "live" ? serverClient() : null;
  if (!client) return demoHealth();
  try {
    const [forecastResult, ingestionResult] = await Promise.all([
      client.from("forecasts").select("generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("ingestion_runs").select("completed_at").eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (forecastResult.error || ingestionResult.error) throw new Error("health unavailable");
    return { app: "ok", mode: "live", database: "connected", xSource: process.env.X_BEARER_TOKEN ? "configured" : "unavailable", openAI: process.env.OPENAI_API_KEY ? "configured" : "unavailable", email: getEmailConfigurationStatus(), lastIngestionAt: ingestionResult.data?.completed_at ?? null, lastForecastAt: forecastResult.data?.generated_at ?? null };
  } catch { return { app: "ok", mode: "live", database: "unavailable", xSource: process.env.X_BEARER_TOKEN ? "configured" : "unavailable", openAI: process.env.OPENAI_API_KEY ? "configured" : "unavailable", email: getEmailConfigurationStatus(), lastIngestionAt: null, lastForecastAt: null }; }
}

export async function getPublicSnapshot(): Promise<PublicSnapshot> {
  const historicalDataset = historicalDatasetSummary();
  const externalContextEvents = loadExternalContextEvents().events;
  const client = configuredMode() === "live" ? serverClient() : null;
  if (client) {
    try {
      const forecasts = await liveForecasts(client);
      const forecast = forecasts.at(-1)!;
      const evidence = await liveEvidence(client, forecast.sourcePostIds);
      const [latestPosts, resetHistory, health] = await Promise.all([livePosts(client, 20), liveResetHistory(client), getPublicHealth()]);
      return { forecast, history: historyFromForecasts(forecasts, evidence), evidence, latestPosts, resetHistory: mergeVerifiedResetHistory(resetHistory), historicalDataset, externalContextEvents, health };
    } catch { /* Safe, clearly labelled Demo fallback below. */ }
  }
  return { forecast: { ...currentForecast(), mode: "demo" }, history: demoHistory(), evidence: state().evidence, latestPosts: demoPosts(20), resetHistory: demoResetHistory(), historicalDataset, externalContextEvents, health: demoHealth() };
}

export async function getForecastHistory(): Promise<Forecast[]> {
  const client = configuredMode() === "live" ? serverClient() : null;
  if (client) try { return await liveForecasts(client); } catch { /* demo fallback */ }
  return state().forecasts.map(forecast => ({ ...forecast, mode: "demo" }));
}

export async function getPublicEvidence(): Promise<Evidence[]> {
  const snapshot = await getPublicSnapshot();
  return snapshot.evidence;
}

export async function getResetHistory(): Promise<ResetHistoryItem[]> {
  const client = configuredMode() === "live" ? serverClient() : null;
  if (client) try { return mergeVerifiedResetHistory(await liveResetHistory(client)); } catch { /* demo fallback */ }
  return demoResetHistory();
}
