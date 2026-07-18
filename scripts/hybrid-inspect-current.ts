import { loadEnvConfig } from "@next/env";
import { loadCanonicalHybridSnapshot } from "../src/lib/canonical-hybrid-snapshot";
import { calculateHybridLikelihood } from "../src/lib/hybrid-likelihood";
import { localExtract } from "../src/lib/extraction/local";

loadEnvConfig(process.cwd());

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
  const snapshot = await loadCanonicalHybridSnapshot();
  const previewPostId = argument("--preview-post-id");
  const output: Record<string, unknown> = {
    persistedHybridScore: snapshot.hybrid.persistedHybridScore,
    currentReadOnlyHybridScore: snapshot.hybrid.hybridScore,
    calibratedProbability: snapshot.forecast.probability,
    credibleInterval: [snapshot.forecast.credibleIntervalLow, snapshot.forecast.credibleIntervalHigh],
    hybridState: snapshot.hybrid.hybridState,
    hybridModelVersion: snapshot.hybrid.hybridModelVersion,
    calibratedModelVersion: snapshot.forecast.modelVersion,
    canonicalCutoff: snapshot.cutoff,
    cycleStartAt: snapshot.hybrid.cycleStartAt,
    previousCycleResolvedAt: snapshot.hybrid.previousCycleResolvedAt,
    previousCycleFinalProbability: snapshot.hybrid.previousCycleFinalProbability,
    eventResolutionStatus: snapshot.hybrid.eventResolutionStatus,
    components: { cyclePoints: snapshot.hybrid.cyclePoints, historicalPoints: snapshot.hybrid.historicalPoints, signalPoints: snapshot.hybrid.signalPoints, negativePoints: snapshot.hybrid.negativePoints, appliedOverride: snapshot.hybrid.appliedOverride },
    confirmation: snapshot.hybrid.confirmation,
    activeSignals: snapshot.hybrid.activeSignals,
    excludedSignals: snapshot.hybrid.excludedSignals,
    persistedForecast: snapshot.persistedForecast,
    resolvedForecast: snapshot.resolvedForecast,
  };
  if (previewPostId) {
    const record = snapshot.posts.find(post => post.platform_post_id === previewPostId);
    if (!record) throw new Error(`Stored post ${previewPostId} was not found`);
    const local = localExtract(record.text);
    const proposed = { ...record.signal, signal: { signalType: local.signal_type, operationalRelevance: local.operational_relevance, resetIntentStrength: local.reset_intent_strength, operatorInterventionStrength: local.operator_intervention_strength, timeImmediacy: local.time_immediacy, sourceAuthority: "monitored_official" as const, extractionConfidence: local.extraction_confidence, requiresReview: local.requires_review, uncertainties: local.uncertainties, resetConfirmed: local.reset_confirmed, resetType: local.reset_type }, verificationStatus: local.requires_review ? "needs_review" as const : "structured" as const };
    const signals = snapshot.signals.map(item => item.postId === previewPostId ? proposed : item);
    const projected = calculateHybridLikelihood({ forecast: snapshot.forecast, resetEvents: snapshot.resetEvents, signals, now: snapshot.cutoff, resolvedForecastProbability: snapshot.resolvedForecast?.probability ?? null });
    output.preview = { postId: previewPostId, text: record.text, previousClassification: record.signal.signal.signalType, proposedClassification: local.signal_type, proposedContribution: projected.excludedSignals.find(item => item.postId === previewPostId) ?? projected.activeSignals.find(item => item.postId === previewPostId) ?? null, currentScore: snapshot.hybrid.hybridScore, projectedScore: projected.hybridScore, scoreDifference: projected.hybridScore - snapshot.hybrid.hybridScore };
  }
  console.log(JSON.stringify(output, null, 2));
}

void main().catch(error => { console.error(error instanceof Error ? error.message : "Hybrid inspection failed"); process.exitCode = 1; });
