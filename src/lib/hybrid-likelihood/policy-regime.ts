import type { HybridSignalInput } from "./types";

const HOUR = 3_600_000;
const FULL_STRENGTH_HOURS = 72;
const EXPIRY_HOURS = 7 * 24;
const MAX_BOOST = 30;
const POLICY_ONLY_CAP = 80;

export type PolicyRegime = {
  state: "inactive" | "reset_policy_active" | "reset_policy_uncertain" | "reset_policy_withdrawn";
  sourcePostId: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  confidence: number;
  reason: string;
  boost: number;
  scoreFloor: number;
  cap: number;
  ageHours: number | null;
  decayFactor: number;
};

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

export function policyRegimeDecayFactor(ageHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0;
  if (ageHours <= FULL_STRENGTH_HOURS) return 1;
  if (ageHours >= EXPIRY_HOURS) return 0;
  const progress = (ageHours - FULL_STRENGTH_HOURS) / (EXPIRY_HOURS - FULL_STRENGTH_HOURS);
  return 1 - progress * progress * (3 - 2 * progress);
}

function inactive(reason = "No current official reset-policy statement is active."): PolicyRegime {
  return { state: "inactive", sourcePostId: null, activatedAt: null, expiresAt: null, confidence: 0, reason, boost: 0, scoreFloor: 30, cap: POLICY_ONLY_CAP, ageHours: null, decayFactor: 0 };
}

export function derivePolicyRegime(signals: HybridSignalInput[], cutoff: string): PolicyRegime {
  const cutoffMs = Date.parse(cutoff);
  const candidates = signals
    .filter(item => item.signal.policyScope === "ongoing" && item.signal.sourceAuthority === "monitored_official" && Date.parse(item.postedAt) <= cutoffMs)
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
  const selected = candidates[0];
  if (!selected) return inactive();
  const ageHours = Math.max(0, (cutoffMs - Date.parse(selected.postedAt)) / HOUR);
  const expiresAt = new Date(Date.parse(selected.postedAt) + EXPIRY_HOURS * HOUR).toISOString();
  const base = { sourcePostId: selected.postId, activatedAt: selected.postedAt, expiresAt, confidence: clamp(selected.signal.extractionConfidence), ageHours, cap: POLICY_ONLY_CAP };
  if (selected.signal.policyPersistence === "withdrawn") return { ...base, state: "reset_policy_withdrawn", reason: "A newer official statement withdrew the continuing-reset policy.", boost: 0, scoreFloor: 30, decayFactor: 1 };
  if (selected.signal.requiresReview || selected.verificationStatus === "needs_review" || selected.signal.policyPersistence === "uncertain") return { ...base, state: "reset_policy_uncertain", reason: "Reset-policy wording is ambiguous or review-blocked and has zero automatic impact.", boost: 0, scoreFloor: 30, decayFactor: policyRegimeDecayFactor(ageHours) };
  const decayFactor = policyRegimeDecayFactor(ageHours);
  if (decayFactor === 0) return inactive("The last official reset-policy statement has expired after seven days without reinforcement.");
  const strongOfficial = selected.signal.extractionConfidence >= .85 && selected.signal.resetIntentStrength >= .8 && selected.signal.operationalRelevance === "high";
  const authorityFactor = selected.signal.sourceAuthority === "monitored_official" ? 1 : .9;
  const evidenceFactor = strongOfficial ? 1 : clamp(selected.signal.extractionConfidence * (.75 + .25 * selected.signal.resetIntentStrength));
  const boost = MAX_BOOST * authorityFactor * evidenceFactor * decayFactor;
  return {
    ...base,
    state: "reset_policy_active",
    reason: ageHours <= FULL_STRENGTH_HOURS
      ? "The monitored official account stated that resets will continue; no timing for the next reset was provided."
      : "The continuing-reset policy remains active with age-based decay and no timing for the next reset.",
    boost,
    scoreFloor: 30 + boost,
    decayFactor,
  };
}

export const POLICY_REGIME_FULL_STRENGTH_HOURS = FULL_STRENGTH_HOURS;
export const POLICY_REGIME_EXPIRY_HOURS = EXPIRY_HOURS;
export const POLICY_REGIME_MAX_BOOST = MAX_BOOST;
export const POLICY_REGIME_CAP = POLICY_ONLY_CAP;
