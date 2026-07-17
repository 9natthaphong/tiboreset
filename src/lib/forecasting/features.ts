import type { Evidence, FeatureName, FeatureOrigin, FeatureOrigins, Features, ForecastContext } from "./types";

const DAY_MS = 86_400_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const emptyContext = (): ForecastContext => ({ verifiedResets: [], milestoneObservations: [], historicalWindows: [], operationalSignals: [], nextPledgedMilestoneUsers: null });

export const milestoneProximity = (current: number | null | undefined, target: number | null | undefined) => current != null && target && target > 0 ? clamp(current / target) : 0;
export const recentResetSuppression = (days: number) => clamp(1 - days / 30);
export const normalizedTimeSinceReset = (days: number) => clamp(days / 30);
export const milestoneVelocity = (previousAt: string | undefined, currentAt: string | undefined) => {
  if (!previousAt || !currentAt) return 0;
  const elapsedDays = Math.max(0, (Date.parse(currentAt) - Date.parse(previousAt)) / DAY_MS);
  return clamp(1 - elapsedDays / 30);
};

export function changePointScore(events: Evidence[], cutoff: string) {
  const cutoffMs = Date.parse(cutoff);
  const recent = events.filter(event => Date.parse(event.postedAt) <= cutoffMs && Date.parse(event.postedAt) > cutoffMs - 7 * DAY_MS).length;
  const baseline = events.filter(event => Date.parse(event.postedAt) <= cutoffMs - 7 * DAY_MS && Date.parse(event.postedAt) > cutoffMs - 35 * DAY_MS).length / 4;
  const ratio = baseline ? recent / baseline : recent ? 2 : 0;
  return { recentRate: recent / 7, baselineRate: baseline / 7, ratio, normalizedSurge: clamp((ratio - 1) / 2), confidence: clamp(events.length / 12) };
}

const sourceReliabilityScore = (evidence: Evidence) => {
  if (evidence.sourceType === "official_x") return evidence.verified ? 1 : .86;
  if (evidence.sourceType === "official_status") return evidence.verified ? .98 : .8;
  if (evidence.sourceType === "manual") return evidence.verified ? .82 : .62;
  if (evidence.sourceType === "demo_fixture") return .65;
  return evidence.verified ? .8 : .6;
};

const cosineSimilarity = (left: Record<string, number>, right: Record<string, number>) => {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  const dot = keys.reduce((sum, key) => sum + (left[key] ?? 0) * (right[key] ?? 0), 0);
  const leftMagnitude = Math.sqrt(keys.reduce((sum, key) => sum + (left[key] ?? 0) ** 2, 0));
  const rightMagnitude = Math.sqrt(keys.reduce((sum, key) => sum + (right[key] ?? 0) ** 2, 0));
  return leftMagnitude && rightMagnitude ? clamp(dot / (leftMagnitude * rightMagnitude)) : 0;
};

export const defaultFeatureOrigin = (name: FeatureName): FeatureOrigin => {
  if (["time_since_last_reset", "recent_reset_suppression", "milestone_proximity", "milestone_velocity", "signal_frequency_change", "source_reliability", "historical_analog_similarity"].includes(name)) return "derived";
  if (name === "historical_analog_success_rate") return "unavailable";
  return "measured";
};

export function buildFeatureSnapshot(evidence: Evidence[], cutoff: string, context: ForecastContext = emptyContext()) {
  const cutoffMs = Date.parse(cutoff);
  const usable = evidence.filter(item => Date.parse(item.postedAt) <= cutoffMs && item.eventType !== "irrelevant");
  const maxConfidence = (type: Evidence["eventType"]) => Math.max(0, ...usable.filter(item => item.eventType === type).map(item => item.confidence));
  const latestEvidenceAt = usable.reduce((latest, item) => Math.max(latest, Date.parse(item.postedAt)), 0);
  const surge = changePointScore(usable, cutoff);
  const verifiedResets = context.verifiedResets.filter(reset => reset.verified && Date.parse(reset.occurredAt) <= cutoffMs).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const latestReset = verifiedResets.at(-1);
  const daysSinceReset = latestReset ? Math.max(0, (cutoffMs - Date.parse(latestReset.occurredAt)) / DAY_MS) : null;
  const milestoneObservations = context.milestoneObservations.filter(observation => observation.verified && Date.parse(observation.occurredAt) <= cutoffMs).sort((a, b) => a.milestoneUsers - b.milestoneUsers);
  const latestMilestone = milestoneObservations.at(-1);
  const previousMilestone = milestoneObservations.at(-2);
  const nextMilestone = context.nextPledgedMilestoneUsers;
  const verifiedOperationalStrength = Math.max(0, ...context.operationalSignals.filter(signal => signal.verified && Date.parse(signal.occurredAt) <= cutoffMs).map(signal => signal.strength));
  const evidenceIncidentStrength = Math.max(0, ...usable.map(item => item.incidentStrength ?? 0));
  const reliability = usable.length ? usable.reduce((sum, item) => sum + sourceReliabilityScore(item) * Math.max(.1, item.confidence), 0) / usable.reduce((sum, item) => sum + Math.max(.1, item.confidence), 0) : 0;

  const base: Features = {
    explicit_reset_confirmation: maxConfidence("explicit_reset_confirmation"),
    explicit_reset_hint: maxConfidence("reset_hint"),
    public_commitment_strength: Math.max(0, ...usable.map(item => item.commitmentStrength ?? 0)),
    milestone_proximity: milestoneProximity(latestMilestone?.milestoneUsers, nextMilestone),
    milestone_velocity: milestoneVelocity(previousMilestone?.occurredAt, latestMilestone?.occurredAt),
    time_since_last_reset: daysSinceReset == null ? 0 : normalizedTimeSinceReset(daysSinceReset),
    recent_reset_suppression: daysSinceReset == null ? 0 : recentResetSuppression(daysSinceReset),
    usage_incident_strength: Math.max(evidenceIncidentStrength, verifiedOperationalStrength),
    capacity_concern: Math.max(0, ...usable.map(item => item.capacityConcern ?? 0)),
    promotional_signal: Math.max(0, ...usable.map(item => item.promotionalSignal ?? 0)),
    product_launch_signal: maxConfidence("product_launch"),
    community_poll_signal: maxConfidence("community_poll"),
    historical_analog_success_rate: 0,
    historical_analog_similarity: 0,
    signal_frequency_change: surge.normalizedSurge * surge.confidence,
    evidence_recency: latestEvidenceAt ? clamp(1 - (cutoffMs - latestEvidenceAt) / (14 * DAY_MS)) : 0,
    source_reliability: clamp(reliability),
    unresolved_ambiguity_penalty: clamp(usable.filter(item => item.confidence < .75).length / Math.max(1, usable.length)),
  };

  const analogs = context.historicalWindows
    .filter(window => window.verificationStatus === "verified" && Date.parse(window.eventAt) <= cutoffMs)
    .map(window => ({ ...window, similarity: cosineSimilarity(base, window.featureVector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
  const scoredAnalogs = analogs.filter((analog): analog is typeof analog & { resetFollowedWithinHorizon: boolean } => analog.resetFollowedWithinHorizon != null);
  base.historical_analog_similarity = analogs.length ? analogs.reduce((sum, analog) => sum + analog.similarity, 0) / analogs.length : 0;
  base.historical_analog_success_rate = scoredAnalogs.length ? scoredAnalogs.filter(analog => analog.resetFollowedWithinHorizon).length / scoredAnalogs.length : 0;

  const origins = Object.fromEntries((Object.keys(base) as FeatureName[]).map(name => [name, defaultFeatureOrigin(name)])) as FeatureOrigins;
  if (!latestReset) { origins.time_since_last_reset = "unavailable"; origins.recent_reset_suppression = "unavailable"; }
  if (!latestMilestone || !nextMilestone) origins.milestone_proximity = "unavailable";
  if (!previousMilestone || !latestMilestone) origins.milestone_velocity = "unavailable";
  if (!usable.length) { origins.signal_frequency_change = "unavailable"; origins.source_reliability = "unavailable"; }
  if (!analogs.length) origins.historical_analog_similarity = "unavailable";
  origins.historical_analog_success_rate = scoredAnalogs.length ? "derived" : "unavailable";

  const details: Record<FeatureName, string> = {
    explicit_reset_confirmation: "Maximum confidence among cutoff-safe direct confirmations.",
    explicit_reset_hint: "Maximum confidence among cutoff-safe reset hints.",
    public_commitment_strength: "Strongest structured public-commitment signal.",
    milestone_proximity: latestMilestone && nextMilestone ? `${(latestMilestone.milestoneUsers ?? 0).toLocaleString()} combined active users ÷ ${nextMilestone.toLocaleString()} pledged milestone.` : "No verified milestone denominator available.",
    milestone_velocity: previousMilestone && latestMilestone ? `Normalized elapsed time between the latest two verified milestone announcements.` : "Fewer than two verified milestone dates available.",
    time_since_last_reset: latestReset && daysSinceReset != null ? `${daysSinceReset.toFixed(2)} days since the latest verified reset announcement.` : "No verified reset before the cutoff.",
    recent_reset_suppression: daysSinceReset != null ? `Thirty-day cooldown derived from ${daysSinceReset.toFixed(2)} elapsed days.` : "No verified reset before the cutoff.",
    usage_incident_strength: verifiedOperationalStrength > evidenceIncidentStrength ? "Verified reviewed OpenAI Status event." : "Strongest structured usage-incident evidence.",
    capacity_concern: "Strongest structured capacity-concern evidence.",
    promotional_signal: "Strongest structured promotional-language evidence.",
    product_launch_signal: "Maximum confidence among product-launch events.",
    community_poll_signal: "Maximum confidence among community-poll events.",
    historical_analog_success_rate: scoredAnalogs.length ? `${scoredAnalogs.length} scored cutoff-safe analog windows.` : "No historical windows currently contain verified forward outcomes.",
    historical_analog_similarity: analogs.length ? `Mean cosine similarity across ${analogs.length} nearest cutoff-safe verified windows.` : "No cutoff-safe verified analog windows available.",
    signal_frequency_change: `${surge.recentRate.toFixed(2)} recent signals/day versus ${surge.baselineRate.toFixed(2)} baseline signals/day.`,
    evidence_recency: latestEvidenceAt ? `Age decay from the latest evidence timestamp.` : "No relevant evidence before the cutoff.",
    source_reliability: usable.length ? "Confidence-weighted source type and review status." : "No source evidence before the cutoff.",
    unresolved_ambiguity_penalty: "Share of evidence below 75% extraction confidence.",
  };
  return { features: base, origins, details };
}

export function buildFeatures(evidence: Evidence[], cutoff: string, context?: ForecastContext): Features {
  return buildFeatureSnapshot(evidence, cutoff, context).features;
}
