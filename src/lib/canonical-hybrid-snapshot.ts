import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { versionedForecastContext } from "@/lib/forecast-context";
import type { Evidence, EventType, ForecastContext } from "@/lib/forecasting";
import { MODEL_V2_VERSION } from "@/lib/forecasting/v2";
import { buildCanonicalHybridSnapshot, type CanonicalHybridSnapshot, type PersistedForecastReference } from "@/lib/hybrid-likelihood/canonical";
import type { HybridResetEvent, HybridSignalInput } from "@/lib/hybrid-likelihood";
import { structuredSignalFromStored } from "@/lib/extraction/structured-signal";
import { hasExplicitCompletedOperationalReset } from "@/lib/extraction/safety";
import { localExtract } from "@/lib/extraction/local";

const postSchema = z.object({
  id: z.string(), platform_post_id: z.string(), text: z.string(), post_url: z.string().nullable(), posted_at: z.string(),
  is_relevant: z.boolean().nullable(), approved_public: z.boolean().nullable(), public_metrics: z.record(z.string(), z.unknown()).nullable(), ingested_at: z.string().nullable(),
});
const eventSchema = z.object({
  id: z.string(), source_post_id: z.string(), extraction_version: z.string(), event_type: z.string(), event_payload: z.record(z.string(), z.unknown()),
  extraction_confidence: z.coerce.number(), requires_review: z.boolean().nullable(), created_at: z.string(),
});
const resetSchema = z.object({ id: z.string(), occurred_at: z.string(), reset_type: z.string(), source_post_id: z.string().nullable(), verified: z.boolean(), verification_notes: z.string().nullable() });
const milestoneSchema = z.object({ id: z.string(), source_post_id: z.string(), source_url: z.string(), reported_active_users: z.coerce.number(), reset_type: z.string(), announced_at: z.string(), execution_at: z.string().nullable(), verification_status: z.string(), verification_method: z.string() });
const forecastReferenceSchema = z.object({
  id: z.string(), forecast_model_id: z.string().nullable(), generated_at: z.string(), probability: z.coerce.number(),
  credible_interval_low: z.coerce.number(), credible_interval_high: z.coerce.number(), evidence_post_ids: z.array(z.string()).nullable(),
});

export type CanonicalPostRecord = z.infer<typeof postSchema> & {
  extraction: z.infer<typeof eventSchema> | null;
  signal: HybridSignalInput;
};

export type LoadedCanonicalHybridSnapshot = CanonicalHybridSnapshot & {
  mode: "live";
  posts: CanonicalPostRecord[];
  account: { username: string; displayName: string; profileImageUrl: string | null };
  lastUpdatedAt: string;
  context: ForecastContext;
};

const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

function verificationStatus(post: z.infer<typeof postSchema>, event: z.infer<typeof eventSchema>) {
  const signal = structuredSignalFromStored({ text: post.text, eventType: event.event_type as EventType, payload: event.event_payload, confidence: event.extraction_confidence, requiresReview: event.requires_review === true });
  const resetTypeEligible = signal.resetType === "full" || signal.resetType === "banked";
  const completed = event.event_type === "explicit_reset_confirmation"
    && signal.signalType === "reset_confirmation"
    && signal.resetConfirmed
    && resetTypeEligible
    && event.requires_review !== true
    && event.extraction_confidence >= .9
    && hasExplicitCompletedOperationalReset(post.text);
  const verifiedPolicyContinuation = signal.signalType === "reset_policy_continuation"
    && signal.policyPersistence === "active"
    && signal.sourceAuthority === "monitored_official"
    && !signal.requiresReview
    && event.requires_review !== true
    && event.extraction_confidence >= .85;
  return { signal, completed, verifiedPolicyContinuation };
}

function cutoffFrom(run: { completed_at?: unknown; metadata?: unknown } | null, forecast: { generated_at?: unknown } | null) {
  const metadata = run?.metadata && typeof run.metadata === "object" ? run.metadata as Record<string, unknown> : {};
  const calculated = metadata.forecastCalculatedAt;
  if (validDate(calculated)) return calculated;
  if (validDate(forecast?.generated_at)) return forecast.generated_at;
  if (validDate(run?.completed_at)) return run.completed_at;
  throw new Error("No canonical calculation cutoff is available");
}

function mergeContext(base: ForecastContext, resetRows: z.infer<typeof resetSchema>[], milestones: z.infer<typeof milestoneSchema>[], derived: HybridResetEvent[], cutoff: string): ForecastContext {
  const verifiedResets = [...base.verifiedResets];
  for (const row of resetRows) if (row.verified && Date.parse(row.occurred_at) <= Date.parse(cutoff) && !verifiedResets.some(item => Date.parse(item.occurredAt) === Date.parse(row.occurred_at))) verifiedResets.push({ occurredAt: row.occurred_at, verified: true });
  for (const event of derived) if (!verifiedResets.some(item => Date.parse(item.occurredAt) === Date.parse(event.occurredAt))) verifiedResets.push({ occurredAt: event.occurredAt, verified: true });
  const milestoneObservations = [...base.milestoneObservations];
  for (const row of milestones) {
    if (row.verification_status !== "verified" || Date.parse(row.announced_at) > Date.parse(cutoff)) continue;
    const users = row.reported_active_users;
    if (!users || milestoneObservations.some(item => Date.parse(item.occurredAt) === Date.parse(row.announced_at))) continue;
    milestoneObservations.push({ occurredAt: row.announced_at, milestoneUsers: users, verified: true, resetType: row.reset_type as "full" | "banked" | "scheduled" | "announcement_only" });
  }
  return { ...base, verifiedResets, milestoneObservations };
}

function configuredClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service connection is unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function loadCanonicalHybridSnapshot(providedClient?: SupabaseClient): Promise<LoadedCanonicalHybridSnapshot> {
  const client = providedClient ?? configuredClient();
  const username = process.env.X_USERNAME ?? "thsottiaux";
  const accountResult = await client.from("monitored_accounts").select("id,username,display_name,profile_image_url").eq("platform", "x").eq("username", username).eq("enabled", true).maybeSingle();
  if (accountResult.error || !accountResult.data) throw new Error("Canonical monitored account is unavailable");
  const [postResult, forecastResult, runResult, resetResult, milestoneResult] = await Promise.all([
    client.from("source_posts").select("id,platform_post_id,text,post_url,posted_at,is_relevant,approved_public,public_metrics,ingested_at").eq("monitored_account_id", accountResult.data.id).eq("approved_public", true).order("posted_at", { ascending: false }).limit(500),
    client.from("forecasts").select("id,forecast_model_id,generated_at,probability,credible_interval_low,credible_interval_high,evidence_post_ids").order("generated_at", { ascending: false }).limit(50),
    client.from("ingestion_runs").select("completed_at,metadata").eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("known_reset_events").select("id,occurred_at,reset_type,source_post_id,verified,verification_notes").eq("verified", true).order("occurred_at", { ascending: true }),
    client.from("milestone_events").select("id,source_post_id,source_url,reported_active_users,reset_type,announced_at,execution_at,verification_status,verification_method").eq("verification_status", "verified").order("announced_at", { ascending: true }),
  ]);
  for (const result of [postResult, forecastResult, runResult, resetResult, milestoneResult]) if (result.error) throw result.error;
  const posts = z.array(postSchema).parse(postResult.data ?? []);
  const eventResult = posts.length
    ? await client.from("extracted_events").select("id,source_post_id,extraction_version,event_type,event_payload,extraction_confidence,requires_review,created_at").in("source_post_id", posts.map(post => post.id)).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (eventResult.error) throw eventResult.error;
  const events = z.array(eventSchema).parse(eventResult.data ?? []);
  const latestEvent = new Map<string, z.infer<typeof eventSchema>>();
  for (const event of events) if (!latestEvent.has(event.source_post_id)) latestEvent.set(event.source_post_id, event);
  const forecastRows = z.array(forecastReferenceSchema).parse(forecastResult.data ?? []);
  const latestForecastRow = forecastRows[0] ?? null;
  // The current hybrid and next-cycle v2 calculations are time-dependent. Use one
  // request-time cutoff for every branch, while still requiring an auditable stored
  // calculation/run before a Live snapshot can be built.
  cutoffFrom(runResult.data, latestForecastRow);
  const cutoff = new Date().toISOString();
  const resetRows = z.array(resetSchema).parse(resetResult.data ?? []);
  const milestones = z.array(milestoneSchema).parse(milestoneResult.data ?? []);
  const knownSourceIds = new Set(resetRows.flatMap(row => row.source_post_id ? [row.source_post_id] : []));
  const milestonePostIds = new Set(milestones.map(row => row.source_post_id));
  const derivedResets: HybridResetEvent[] = [];
  const evidence: Evidence[] = [];
  const signals: HybridSignalInput[] = [];
  const postRecords: CanonicalPostRecord[] = [];
  for (const post of posts) {
    const event = latestEvent.get(post.id) ?? null;
    if (!event) {
      const local = localExtract(post.text);
      const signal: HybridSignalInput = {
        id: `screen:${post.id}`,
        postId: post.platform_post_id,
        text: post.text,
        postedAt: post.posted_at,
        sourceUrl: post.post_url ?? `https://x.com/i/status/${post.platform_post_id}`,
        signal: {
          signalType: local.signal_type,
          operationalRelevance: local.operational_relevance,
          resetIntentStrength: local.reset_intent_strength,
          operatorInterventionStrength: local.operator_intervention_strength,
          timeImmediacy: local.time_immediacy,
          sourceAuthority: "monitored_official",
          extractionConfidence: local.extraction_confidence,
          requiresReview: local.requires_review,
          uncertainties: local.uncertainties,
          resetConfirmed: local.reset_confirmed,
          resetType: local.reset_type,
          policyScope: local.policy_scope,
          policyPersistence: local.policy_persistence,
        },
        verificationStatus: local.requires_review ? "needs_review" : "structured",
      };
      signals.push(signal);
      postRecords.push({ ...post, extraction: null, signal });
      continue;
    }
    const verified = verificationStatus(post, event);
    const status = event.requires_review === true ? "needs_review" as const : verified.completed || verified.verifiedPolicyContinuation ? "verified" as const : "structured" as const;
    const signal: HybridSignalInput = { id: event.id, postId: post.platform_post_id, text: post.text, postedAt: post.posted_at, sourceUrl: post.post_url ?? `https://x.com/i/status/${post.platform_post_id}`, signal: verified.signal, verificationStatus: status };
    signals.push(signal);
    postRecords.push({ ...post, extraction: event, signal });
    if (post.is_relevant && event.requires_review !== true && verified.signal.signalType !== "operator_intervention") evidence.push({ id: event.id, postId: post.id, postedAt: post.posted_at, excerpt: post.text, eventType: event.event_type as EventType, confidence: event.extraction_confidence, verified: status === "verified" || event.requires_review === false, sourceType: "official_x", url: signal.sourceUrl, effect: asNumber(event.event_payload.forecastImpact), commitmentStrength: asNumber(event.event_payload.commitment_strength), milestoneCurrent: typeof event.event_payload.milestone_current === "number" ? event.event_payload.milestone_current : null, milestoneTarget: typeof event.event_payload.milestone_target === "number" ? event.event_payload.milestone_target : null, incidentStrength: asNumber(event.event_payload.incident_strength), capacityConcern: asNumber(event.event_payload.capacity_concern), promotionalSignal: asNumber(event.event_payload.promotional_signal) });
    if (verified.completed) derivedResets.push({ id: `extraction:${event.id}`, occurredAt: post.posted_at, resetType: verified.signal.resetType as "full" | "banked", verified: true, sourcePostId: post.platform_post_id, sourceRecordId: post.id, sourceUrl: signal.sourceUrl, sourceText: post.text, verificationSource: `${String(event.event_payload.extractionSource ?? "stored_extraction")}:${event.extraction_version}+deterministic_completed_text`, synchronizedKnownReset: knownSourceIds.has(post.id), synchronizedMilestone: milestonePostIds.has(post.platform_post_id) });
  }
  const ledgerResets: HybridResetEvent[] = resetRows.filter(row => row.reset_type === "full" || row.reset_type === "banked").map(row => ({ id: row.id, occurredAt: row.occurred_at, resetType: row.reset_type as "full" | "banked", verified: row.verified, verificationSource: row.verification_notes ?? "known_reset_events", synchronizedKnownReset: true, synchronizedMilestone: false }));
  const milestoneResets: HybridResetEvent[] = milestones.filter(row => row.reset_type === "full" || row.reset_type === "banked").map(row => ({ id: row.id, occurredAt: row.execution_at ?? row.announced_at, resetType: row.reset_type as "full" | "banked", verified: true, sourcePostId: row.source_post_id, sourceUrl: row.source_url, verificationSource: row.verification_method, synchronizedKnownReset: false, synchronizedMilestone: true }));
  const resetEvents = [...ledgerResets, ...milestoneResets, ...derivedResets].filter((event, index, all) => index === all.findIndex(candidate => candidate.sourcePostId && event.sourcePostId ? candidate.sourcePostId === event.sourcePostId : Date.parse(candidate.occurredAt) === Date.parse(event.occurredAt)));
  const context = mergeContext(versionedForecastContext(cutoff), resetRows, milestones, derivedResets, cutoff);
  let persistedForecast: PersistedForecastReference = null;
  let persistedForecasts: Exclude<PersistedForecastReference, null>[] = [];
  if (latestForecastRow) {
    const modelResult = latestForecastRow.forecast_model_id ? await client.from("forecast_models").select("version").eq("id", latestForecastRow.forecast_model_id).maybeSingle() : { data: null, error: null };
    if (modelResult.error) throw modelResult.error;
    const modelVersion = String(modelResult.data?.version ?? MODEL_V2_VERSION);
    persistedForecasts = forecastRows.map(row => ({ id: row.id, generatedAt: row.generated_at, modelVersion, probability: row.probability, credibleIntervalLow: row.credible_interval_low, credibleIntervalHigh: row.credible_interval_high, evidencePostIds: row.evidence_post_ids ?? [] }));
    persistedForecast = persistedForecasts[0] ?? null;
  }
  const latestReset = resetEvents
    .filter(event => event.verified && Date.parse(event.occurredAt) <= Date.parse(cutoff))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] ?? null;
  const hasResolvedReference = latestReset
    ? persistedForecasts.some(item => Date.parse(item.generatedAt) >= Date.parse(latestReset.occurredAt)
      && item.probability >= .98
      && (!latestReset.sourceRecordId || item.evidencePostIds?.includes(latestReset.sourceRecordId)))
    : false;
  if (latestReset && !hasResolvedReference) {
    let resolvedQuery = client.from("forecasts")
      .select("id,forecast_model_id,generated_at,probability,credible_interval_low,credible_interval_high,evidence_post_ids")
      .gte("generated_at", latestReset.occurredAt)
      .gte("probability", .98)
      .order("generated_at", { ascending: true })
      .limit(1);
    if (latestReset.sourceRecordId) resolvedQuery = resolvedQuery.contains("evidence_post_ids", [latestReset.sourceRecordId]);
    const resolvedResult = await resolvedQuery.maybeSingle();
    if (resolvedResult.error) throw resolvedResult.error;
    if (resolvedResult.data) {
      const resolvedRow = forecastReferenceSchema.parse(resolvedResult.data);
      let resolvedModelVersion = MODEL_V2_VERSION;
      if (resolvedRow.forecast_model_id) {
        const resolvedModelResult = await client.from("forecast_models").select("version").eq("id", resolvedRow.forecast_model_id).maybeSingle();
        if (resolvedModelResult.error) throw resolvedModelResult.error;
        resolvedModelVersion = String(resolvedModelResult.data?.version ?? MODEL_V2_VERSION);
      }
      persistedForecasts.push({ id: resolvedRow.id, generatedAt: resolvedRow.generated_at, modelVersion: resolvedModelVersion, probability: resolvedRow.probability, credibleIntervalLow: resolvedRow.credible_interval_low, credibleIntervalHigh: resolvedRow.credible_interval_high, evidencePostIds: resolvedRow.evidence_post_ids ?? [] });
    }
  }
  const snapshot = buildCanonicalHybridSnapshot({ cutoff, evidence, signals, resetEvents, context, persistedForecast, persistedForecasts, simulations: Number(process.env.MONTE_CARLO_SIMULATIONS ?? 5000), seed: Number(process.env.MONTE_CARLO_SEED ?? 20260716) });
  return { ...snapshot, mode: "live", posts: postRecords, account: { username: String(accountResult.data.username), displayName: String(accountResult.data.display_name ?? accountResult.data.username), profileImageUrl: typeof accountResult.data.profile_image_url === "string" ? accountResult.data.profile_image_url : null }, lastUpdatedAt: String(postRecords[0]?.ingested_at ?? postRecords[0]?.posted_at ?? cutoff), context };
}

export function canLoadCanonicalHybridSnapshot() {
  return process.env.NEXT_PUBLIC_APP_MODE === "live" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
