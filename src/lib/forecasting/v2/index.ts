import { buildFeatureSnapshot } from "../features";
import type { Evidence, ForecastContext } from "../types";
import { MILESTONE_TARGET_POLICY } from "@/lib/milestones";
import { applyEvidenceOverride, combineIndependentRisks, policyAlertBand } from "./combine";
import { estimateMilestoneArrival, type MilestoneObservation } from "./milestone-arrival";
import { policyMonteCarlo } from "./monte-carlo";
import { resetGivenMilestonePosterior } from "./policy-posterior";

export const MODEL_V2_VERSION = "reset-oracle-2.0.0";

export function policyForecast(input: { evidence: Evidence[]; milestones: MilestoneObservation[]; cutoff: string; horizonHours?: number; count?: number; seed?: number; context?: ForecastContext }) {
  const horizonHours = input.horizonHours ?? 36;
  const availableMilestones = input.milestones.filter(item => Date.parse(item.announcedAt) < Date.parse(input.cutoff)).sort((a, b) => a.users - b.users);
  const latest = availableMilestones.at(-1);
  const nextTargetUsers = latest && latest.users < MILESTONE_TARGET_POLICY.finalPledgedTargetUsers ? latest.users + MILESTONE_TARGET_POLICY.stepUsers : null;
  const policyKnown = availableMilestones.some(item => item.users >= 3_000_000);
  const policyActive = policyKnown && nextTargetUsers != null && nextTargetUsers <= MILESTONE_TARGET_POLICY.finalPledgedTargetUsers;
  const interval = estimateMilestoneArrival(availableMilestones, input.cutoff, horizonHours);
  const posterior = resetGivenMilestonePosterior(availableMilestones.filter(item => item.users >= 3_000_000));
  const context = input.context ? { ...input.context, verifiedResets: input.context.verifiedResets.filter(item => Date.parse(item.occurredAt) < Date.parse(input.cutoff)), milestoneObservations: input.context.milestoneObservations.filter(item => Date.parse(item.occurredAt) < Date.parse(input.cutoff)), historicalWindows: input.context.historicalWindows.filter(item => Date.parse(item.eventAt) < Date.parse(input.cutoff)), operationalSignals: input.context.operationalSignals.filter(item => Date.parse(item.occurredAt) < Date.parse(input.cutoff)), nextPledgedMilestoneUsers: nextTargetUsers } : { verifiedResets: availableMilestones.filter(item => item.resetType === "full" || item.resetType === "banked").map(item => ({ occurredAt: item.announcedAt, milestoneUsers: item.users, verified: true })), milestoneObservations: availableMilestones.map(item => ({ occurredAt: item.announcedAt, milestoneUsers: item.users, verified: true, resetType: item.resetType })), historicalWindows: [], operationalSignals: [], nextPledgedMilestoneUsers: nextTargetUsers };
  const snapshot = buildFeatureSnapshot(input.evidence, input.cutoff, context);
  const baselineFeatures = { ...snapshot.features };
  snapshot.features.milestone_proximity = 0;
  snapshot.origins.milestone_proximity = "unavailable";
  snapshot.details.milestone_proximity = "Retired as a v2 forecast driver. The exact active-user count between official milestones is unknown; the policy branch uses conditional milestone-arrival pressure instead.";
  snapshot.features.milestone_velocity = 0;
  snapshot.origins.milestone_velocity = "unavailable";
  snapshot.details.milestone_velocity = "Represented by the cutoff-safe renewal interval model in v2, not by the legacy normalized velocity feature.";
  const visible = input.evidence.filter(item => Date.parse(item.postedAt) <= Date.parse(input.cutoff));
  const freshConfirmations = visible.filter(item => Date.parse(item.postedAt) > Date.parse(input.cutoff) - 6 * 3_600_000);
  const timelyCommitments = visible.filter(item => Date.parse(item.postedAt) > Date.parse(input.cutoff) - horizonHours * 3_600_000);
  const confirmed = freshConfirmations.some(item => item.eventType === "explicit_reset_confirmation" && item.verified);
  const directCommitmentConfidence = Math.max(0, ...timelyCommitments.filter(item => item.eventType === "milestone_commitment" || item.eventType === "reset_hint").filter(item => (item.commitmentStrength ?? 0) >= .8).map(item => item.confidence));
  const arrivalEvidenceBoost = Math.max(0, ...visible.filter(item => nextTargetUsers != null && item.milestoneCurrent === nextTargetUsers).map(item => item.confidence * (1 + (item.commitmentStrength ?? 0))));
  const simulation = policyMonteCarlo({ features: snapshot.features, interval, posterior, horizonHours, policyActive, arrivalEvidenceBoost, count: input.count, seed: input.seed });
  const combinedPoint = applyEvidenceOverride(combineIndependentRisks(simulation.policy.median, simulation.discretionary.median), { confirmed, directCommitmentConfidence });
  const probability = Math.max(.005, Math.min(confirmed ? .995 : .97, Math.max(combinedPoint, simulation.total.median)));
  const override = (value: number) => applyEvidenceOverride(value, { confirmed, directCommitmentConfidence });
  snapshot.details.recent_reset_suppression = `${snapshot.details.recent_reset_suppression} This cooldown applies only to discretionary reset risk.`;
  return { modelVersion: MODEL_V2_VERSION, generatedAt: input.cutoff, horizonHours, probability, low: Math.max(.005, Math.min(confirmed ? .995 : .97, override(simulation.total.p10))), high: Math.max(.005, Math.min(confirmed ? .995 : .97, override(simulation.total.p90))), policyProbability: simulation.policy.median, discretionaryProbability: simulation.discretionary.median, simulation, interval, posterior, policyActive, policyStatus: latest?.users === MILESTONE_TARGET_POLICY.finalPledgedTargetUsers ? "fulfilled" as const : policyActive ? "active" as const : "unavailable" as const, nextTargetUsers, latestMilestoneUsers: latest?.users ?? null, features: snapshot.features, baselineFeatures, featureOrigins: snapshot.origins, featureDetails: snapshot.details, alertBand: policyAlertBand(probability), evidenceIds: visible.map(item => item.id) };
}

export * from "./milestone-arrival";
export * from "./policy-posterior";
export * from "./discretionary-hazard";
export * from "./combine";
export * from "./monte-carlo";
