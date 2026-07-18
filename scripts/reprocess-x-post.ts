import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadCanonicalHybridSnapshot } from "../src/lib/canonical-hybrid-snapshot";
import { calculateHybridLikelihood } from "../src/lib/hybrid-likelihood";
import { localExtract } from "../src/lib/extraction/local";

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
  const proposedSignal = { ...record.signal, signal: { signalType: proposed.signal_type, operationalRelevance: proposed.operational_relevance, resetIntentStrength: proposed.reset_intent_strength, operatorInterventionStrength: proposed.operator_intervention_strength, timeImmediacy: proposed.time_immediacy, sourceAuthority: "monitored_official" as const, extractionConfidence: proposed.extraction_confidence, requiresReview: proposed.requires_review, uncertainties: proposed.uncertainties, resetConfirmed: proposed.reset_confirmed, resetType: proposed.reset_type }, verificationStatus: proposed.requires_review ? "needs_review" as const : "structured" as const };
  const projected = calculateHybridLikelihood({ forecast: snapshot.forecast, resetEvents: snapshot.resetEvents, signals: snapshot.signals.map(item => item.postId === postId ? proposedSignal : item), now: snapshot.cutoff, resolvedForecastProbability: snapshot.resolvedForecast?.probability ?? null });
  const contribution = projected.excludedSignals.find(item => item.postId === postId) ?? projected.activeSignals.find(item => item.postId === postId) ?? null;
  console.log(JSON.stringify({ mode: confirm ? "confirm" : "dry-run", postId, text: record.text, previousClassification: record.signal.signal.signalType, proposedEventType: proposed.event_type, proposedSignalType: proposed.signal_type, proposedContribution: contribution, currentHybridScore: snapshot.hybrid.hybridScore, projectedHybridScore: projected.hybridScore, scoreDifference: projected.hybridScore - snapshot.hybrid.hybridScore, externalXCalls: 0, externalOpenAICalls: 0 }, null, 2));
  if (confirm) {
    const version = "reset-extraction-1.2.0+manual-local-reprocess-v1";
    const existing = await client.from("extracted_events").select("id").eq("source_post_id", record.id).eq("extraction_version", version).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) {
      const inserted = await client.from("extracted_events").insert({ source_post_id: record.id, extraction_version: version, event_type: proposed.event_type, event_payload: { ...proposed, forecastImpact: 0, extractionSource: "manual_local_reprocess", calibratedModelEligible: proposed.signal_type !== "operator_intervention" }, extraction_confidence: proposed.extraction_confidence, requires_review: proposed.requires_review }).select("id").single();
      if (inserted.error) throw inserted.error;
      console.log(JSON.stringify({ persisted: true, extractionId: inserted.data.id }));
    } else console.log(JSON.stringify({ persisted: false, reason: "idempotent_existing_extraction", extractionId: existing.data.id }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stored-post reprocessing failed");
  process.exitCode = 1;
});
