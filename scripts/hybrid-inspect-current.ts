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
    currentReadOnlyWatchScore: snapshot.hybrid.watchScore,
    calibratedProbability: snapshot.forecast.probability,
    credibleInterval: [snapshot.forecast.credibleIntervalLow, snapshot.forecast.credibleIntervalHigh],
    hybridState: snapshot.hybrid.hybridState,
    watchModelVersion: snapshot.hybrid.watchModelVersion,
    calibratedModelVersion: snapshot.forecast.modelVersion,
    canonicalCutoff: snapshot.cutoff,
    cycleStartAt: snapshot.hybrid.cycleStartAt,
    previousCycleResolvedAt: snapshot.hybrid.previousCycleResolvedAt,
    previousCycleFinalProbability: snapshot.hybrid.previousCycleFinalProbability,
    eventResolutionStatus: snapshot.hybrid.eventResolutionStatus,
    cycle: { elapsedCycleHours: snapshot.hybrid.elapsedCycleHours, expectedCycleHours: snapshot.hybrid.expectedCycleHours, elapsedCycleRatio: snapshot.hybrid.elapsedCycleRatio, cyclePoints: snapshot.hybrid.cyclePoints, cycleMaturity: snapshot.hybrid.cycleMaturity, intervalSource: snapshot.hybrid.intervalSource, intervalSampleCount: snapshot.hybrid.intervalSampleCount },
    channels: { timingChannel: snapshot.hybrid.timingChannel, policyTimingChannel: snapshot.hybrid.policyTimingChannel, strongestSignalChannel: snapshot.hybrid.strongestSignalChannel, negativePenalty: snapshot.hybrid.negativePenalty, maxWinningChannel: snapshot.hybrid.maxWinningChannel, finalWatchScore: snapshot.hybrid.watchScore, appliedOverride: snapshot.hybrid.appliedOverride },
    whyThisScore: snapshot.hybrid.whyThisScore,
    policyRegime: { state: snapshot.hybrid.policyRegimeState, sourcePostId: snapshot.hybrid.policyRegimeSourcePostId, activatedAt: snapshot.hybrid.policyRegimeActivatedAt, expiresAt: snapshot.hybrid.policyRegimeExpiresAt, confidence: snapshot.hybrid.policyRegimeConfidence, reason: snapshot.hybrid.policyRegimeReason, ageHours: snapshot.hybrid.policyRegimeAgeHours, decayFactor: snapshot.hybrid.policyRegimeDecayFactor, watchCounterfactualDeltaPoints: snapshot.hybrid.policyRegimeWatchCounterfactualDeltaPoints, calibratedCounterfactualDeltaPercentagePoints: snapshot.hybrid.policyRegimeCalibratedCounterfactualDeltaPercentagePoints },
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
    const proposed = { ...record.signal, signal: { signalType: local.signal_type, operationalRelevance: local.operational_relevance, resetIntentStrength: local.reset_intent_strength, operatorInterventionStrength: local.operator_intervention_strength, timeImmediacy: local.time_immediacy, sourceAuthority: "monitored_official" as const, extractionConfidence: local.extraction_confidence, requiresReview: local.requires_review, uncertainties: local.uncertainties, resetConfirmed: local.reset_confirmed, resetType: local.reset_type, policyScope: local.policy_scope, policyPersistence: local.policy_persistence }, verificationStatus: local.requires_review ? "needs_review" as const : "structured" as const };
    const signals = snapshot.signals.map(item => item.postId === previewPostId ? proposed : item);
    const projected = calculateHybridLikelihood({ forecast: snapshot.forecast, resetEvents: snapshot.resetEvents, signals, now: snapshot.cutoff, resolvedForecastProbability: snapshot.resolvedForecast?.probability ?? null });
    output.preview = { postId: previewPostId, text: record.text, previousClassification: record.signal.signal.signalType, proposedClassification: local.signal_type, proposedContribution: projected.excludedSignals.find(item => item.postId === previewPostId) ?? projected.activeSignals.find(item => item.postId === previewPostId) ?? null, currentScore: snapshot.hybrid.watchScore, projectedScore: projected.watchScore, scoreDifference: projected.watchScore - snapshot.hybrid.watchScore };
  }
  console.log(JSON.stringify(output, null, 2));
}

void main().catch(error => { console.error(error instanceof Error ? error.message : "Hybrid inspection failed"); process.exitCode = 1; });
