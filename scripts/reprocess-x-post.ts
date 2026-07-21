import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadCanonicalHybridSnapshot } from "../src/lib/canonical-hybrid-snapshot";
import { buildCanonicalHybridSnapshot } from "../src/lib/hybrid-likelihood/canonical";
import { localExtract } from "../src/lib/extraction/local";
import type { Evidence, EventType } from "../src/lib/forecasting";

const REPROCESS_VERSION = "reset-extraction-1.3.0+manual-local-reprocess-policy-v1";

async function main() {
  loadEnvConfig(process.cwd());
  const index = process.argv.indexOf("--post-id");
  const postId = index >= 0 ? process.argv[index + 1] : null;
  const confirm = process.argv.includes("--confirm");
  if (!postId) throw new Error("Usage: npm run reprocess:x-post -- --post-id <platform-post-id> [--confirm]");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service connection is unavailable");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const snapshot = await loadCanonicalHybridSnapshot(client);
  const record = snapshot.posts.find(post => post.platform_post_id === postId);
  if (!record) throw new Error(`Stored post ${postId} was not found`);
  const proposed = localExtract(record.text);
  const proposedSignal = {
    ...record.signal,
    signal: {
      signalType: proposed.signal_type,
      operationalRelevance: proposed.operational_relevance,
      resetIntentStrength: proposed.reset_intent_strength,
      operatorInterventionStrength: proposed.operator_intervention_strength,
      timeImmediacy: proposed.time_immediacy,
      sourceAuthority: "monitored_official" as const,
      extractionConfidence: proposed.extraction_confidence,
      requiresReview: proposed.requires_review,
      uncertainties: proposed.uncertainties,
      resetConfirmed: proposed.reset_confirmed,
      resetType: proposed.reset_type,
      policyScope: proposed.policy_scope,
      policyPersistence: proposed.policy_persistence,
    },
    verificationStatus: proposed.requires_review ? "needs_review" as const : "structured" as const,
  };
  const proposedEvidence: Evidence = {
    id: proposedSignal.id,
    postId: record.id,
    postedAt: record.posted_at,
    excerpt: record.text,
    eventType: proposed.event_type as EventType,
    confidence: proposed.extraction_confidence,
    verified: !proposed.requires_review,
    sourceType: "official_x",
    url: proposedSignal.sourceUrl,
    effect: 0,
    commitmentStrength: proposed.commitment_strength,
    milestoneCurrent: proposed.milestone_current,
    milestoneTarget: proposed.milestone_target,
    incidentStrength: proposed.incident_strength,
    capacityConcern: proposed.capacity_concern,
    promotionalSignal: proposed.promotional_signal,
  };
  const projected = buildCanonicalHybridSnapshot({
    cutoff: snapshot.cutoff,
    evidence: [...snapshot.evidence.filter(item => item.id !== proposedSignal.id), proposedEvidence],
    signals: snapshot.signals.map(item => item.postId === postId ? proposedSignal : item),
    resetEvents: snapshot.resetEvents,
    context: snapshot.context,
    persistedForecast: snapshot.persistedForecast,
    simulations: Number(process.env.MONTE_CARLO_SIMULATIONS ?? 5000),
    seed: Number(process.env.MONTE_CARLO_SEED ?? 20260716),
  });
  const contribution = projected.hybrid.excludedSignals.find(item => item.postId === postId) ?? projected.hybrid.activeSignals.find(item => item.postId === postId) ?? null;
  console.log(JSON.stringify({
    mode: confirm ? "confirm" : "dry-run",
    postId,
    text: record.text,
    previousClassification: record.extraction ? record.signal.signal.signalType : record.is_relevant === true ? "relevant_without_extraction" : "irrelevant",
    currentDerivedClassification: record.signal.signal.signalType,
    proposedEventType: proposed.event_type,
    proposedSignalType: proposed.signal_type,
    proposedContribution: contribution,
    policyRegimeState: projected.hybrid.policyRegimeState,
    policyConfidence: projected.hybrid.policyRegimeConfidence,
    cycleMaturity: projected.hybrid.cycleMaturity,
    policyDecay: projected.hybrid.policyRegimeDecayFactor,
    policyTimingChannel: projected.hybrid.policyTimingChannel,
    winningChannel: projected.hybrid.maxWinningChannel,
    timingOverride: projected.hybrid.appliedOverride,
    calibratedCounterfactualDeltaPercentagePoints: projected.hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints,
    currentWatchScore: snapshot.hybrid.watchScore,
    projectedWatchScore: projected.hybrid.watchScore,
    scoreDifference: projected.hybrid.watchScore - snapshot.hybrid.watchScore,
    currentCalibratedProbability: snapshot.forecast.probability,
    projectedCalibratedProbability: projected.forecast.probability,
    externalXCalls: 0,
    externalOpenAICalls: 0,
    mutationPerformed: false,
  }, null, 2));

  if (!confirm) return;
  const existing = await client.from("extracted_events").select("id").eq("source_post_id", record.id).eq("extraction_version", REPROCESS_VERSION).maybeSingle();
  if (existing.error) throw existing.error;
  let extractionId = existing.data?.id ?? null;
  let persisted = false;
  if (!extractionId) {
    const inserted = await client.from("extracted_events").insert({
      source_post_id: record.id,
      extraction_version: REPROCESS_VERSION,
      event_type: proposed.event_type,
      event_payload: { ...proposed, forecastImpact: 0, extractionSource: "manual_local_reprocess", calibratedModelEligible: true, schemaVersion: "reset-event-schema-1.2.0" },
      extraction_confidence: proposed.extraction_confidence,
      requires_review: proposed.requires_review,
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    extractionId = inserted.data.id;
    const updated = await client.from("source_posts").update({ is_relevant: proposed.is_relevant, relevance_reason: proposed.relevance_reason }).eq("id", record.id);
    if (updated.error) throw updated.error;
    persisted = true;
  }
  const refreshed = await loadCanonicalHybridSnapshot(client);
  console.log(JSON.stringify({ persisted, extractionId, reason: persisted ? "corrected_extraction_inserted" : "idempotent_existing_extraction", canonicalSnapshotRefreshed: true, watchScore: refreshed.hybrid.watchScore, winningChannel: refreshed.hybrid.maxWinningChannel, calibratedProbability: refreshed.forecast.probability, policyRegimeState: refreshed.hybrid.policyRegimeState, policySourcePostId: refreshed.hybrid.policyRegimeSourcePostId }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stored-post reprocessing failed");
  process.exitCode = 1;
});
