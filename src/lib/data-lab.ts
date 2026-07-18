import "server-only";
import { z } from "zod";
import { loadHistoricalDatasets } from "@/lib/historical-data";
import { loadExternalContextEvents, ReviewedOpenAIStatusAdapter } from "@/lib/external-context";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/server";
import { buildMilestoneSeedRows } from "@/lib/historical-data";
import { deriveMilestoneState } from "@/lib/milestones";
import { loadCanonicalHybridSnapshot } from "@/lib/canonical-hybrid-snapshot";
import { MODEL_V2_VERSION } from "@/lib/forecasting/v2";
import { structuredSignalFromStored } from "@/lib/extraction/structured-signal";
import type { EventType } from "@/lib/forecasting";

const backtestSchema = z.object({ cutoff_at: z.string(), horizon_hours: z.number(), predicted_probability: z.coerce.number(), actual_outcome: z.boolean(), brier_loss: z.coerce.number(), model_version: z.string(), evidence_count: z.number() });
const runSchema = z.object({ id: z.string(), completed_at: z.string().nullable(), status: z.string(), posts_read: z.number().nullable(), posts_inserted: z.number().nullable(), posts_analyzed: z.number().nullable(), metadata: z.record(z.string(), z.unknown()).nullable() });
const eventDetailSchema = z.object({ id: z.string(), source_post_id: z.string(), extraction_version: z.string(), event_type: z.string(), event_payload: z.record(z.string(), z.unknown()), extraction_confidence: z.coerce.number(), requires_review: z.boolean(), created_at: z.string() });
const postDetailSchema = z.object({ id: z.string(), platform_post_id: z.string(), post_url: z.string().nullable(), text: z.string(), posted_at: z.string() });

export async function getDataLabSnapshot() {
  const datasets = loadHistoricalDatasets();
  const externalContext = loadExternalContextEvents();
  const operationalEvents = new ReviewedOpenAIStatusAdapter(externalContext).load();
  const verified = datasets.ledger.records.filter(record => record.verificationStatus === "verified").length;
  const positive = datasets.windows.windows.filter(window => window.observationWindow === "positive").length;
  const seed = {
    version: datasets.ledger.datasetVersion,
    sourceCount: datasets.manifest.sources.length,
    resetRecords: datasets.ledger.records.length,
    verified,
    unverified: datasets.ledger.records.length - verified,
    signalWindows: datasets.windows.windows.length,
    positive,
    negative: datasets.windows.windows.length - positive,
    retrospectiveScoringAvailable: datasets.windows.windows.some(window => window.forecastBefore != null && window.resetFollowedWithinHorizon != null),
    windows: datasets.windows.windows,
    sources: datasets.manifest.sources,
    resetLedger: datasets.ledger.records,
  };
  const seedMilestones = buildMilestoneSeedRows(datasets);
  const seedMilestoneState = deriveMilestoneState(seedMilestones);
  const context = { externalContext: externalContext.events, operationalEvents, milestoneCandidates: seedMilestones, milestoneState: seedMilestoneState };
  if (!isServiceSupabaseConfigured()) return { database: "unavailable" as const, seed, modelVersion: MODEL_V2_VERSION, latestForecast: null, canonicalSnapshot: null, counts: null, backtests: [], ingestionRuns: [], extractedEvents: [], ...context };
  try {
    const client = getServiceSupabase();
    const [canonicalSnapshot, posts, events, resets, forecasts, latestForecast, backtests, runs, eventDetails, postDetails, milestones] = await Promise.all([
      loadCanonicalHybridSnapshot(client),
      client.from("source_posts").select("id", { count: "exact", head: true }),
      client.from("extracted_events").select("id", { count: "exact", head: true }),
      client.from("known_reset_events").select("id", { count: "exact", head: true }),
      client.from("forecasts").select("id", { count: "exact", head: true }),
      client.from("forecasts").select("id,generated_at,data_cutoff,feature_snapshot,probability,forecast_model_id,horizon_hours,evidence_post_ids,simulation_summary").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("historical_backtests").select("cutoff_at,horizon_hours,predicted_probability,actual_outcome,brier_loss,model_version,evidence_count").order("cutoff_at", { ascending: false }).limit(100),
      client.from("ingestion_runs").select("id,completed_at,status,posts_read,posts_inserted,posts_analyzed,metadata").order("started_at", { ascending: false }).limit(20),
      client.from("extracted_events").select("id,source_post_id,extraction_version,event_type,event_payload,extraction_confidence,requires_review,created_at").order("created_at", { ascending: false }).limit(20),
      client.from("source_posts").select("id,platform_post_id,post_url,text,posted_at").order("posted_at", { ascending: false }).limit(40),
      client.from("milestone_events").select("id,source_post_id,source_url,source_account,reported_active_users,denominator,reset_type,announced_at,execution_at,verification_status,verification_method,rejection_reason").order("announced_at", { ascending: false }).limit(100),
    ]);
    for (const result of [posts, events, resets, forecasts, latestForecast, backtests, runs, eventDetails, postDetails, milestones]) if (result.error) throw result.error;
    const parsedPosts = z.array(postDetailSchema).parse(postDetails.data ?? []);
    const postById = new Map(parsedPosts.map(post => [post.id, post]));
    const extractedEvents = z.array(eventDetailSchema).parse(eventDetails.data ?? []).map(event => {
      const source = postById.get(event.source_post_id) ?? null;
      const signalType = source ? structuredSignalFromStored({ text: source.text, eventType: event.event_type as EventType, payload: event.event_payload, confidence: event.extraction_confidence, requiresReview: event.requires_review }).signalType : typeof event.event_payload.signal_type === "string" ? event.event_payload.signal_type : event.event_type;
      return { ...event, signal_type: signalType, source };
    });
    const milestoneCandidates = (milestones.data ?? []).map(row => ({ id: String(row.id), sourcePostId: String(row.source_post_id), sourceUrl: String(row.source_url), sourceAccount: String(row.source_account), reportedActiveUsers: Number(row.reported_active_users), denominator: row.denominator, resetType: row.reset_type, announcedAt: String(row.announced_at), executionAt: row.execution_at ? String(row.execution_at) : null, verificationStatus: row.verification_status, verificationMethod: String(row.verification_method), rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null })) as typeof seedMilestones;
    return {
      database: "connected" as const,
      seed,
      modelVersion: canonicalSnapshot.forecast.modelVersion,
      latestForecast: latestForecast.data,
      canonicalSnapshot,
      counts: { sourcePosts: posts.count ?? 0, extractedEvents: events.count ?? 0, knownResetEvents: resets.count ?? 0, forecasts: forecasts.count ?? 0 },
      backtests: z.array(backtestSchema).parse(backtests.data ?? []),
      ingestionRuns: z.array(runSchema).parse(runs.data ?? []),
      extractedEvents,
      ...context,
      milestoneCandidates,
      milestoneState: deriveMilestoneState(milestoneCandidates),
    };
  } catch {
    return { database: "unavailable" as const, seed, modelVersion: MODEL_V2_VERSION, latestForecast: null, canonicalSnapshot: null, counts: null, backtests: [], ingestionRuns: [], extractedEvents: [], ...context };
  }
}
