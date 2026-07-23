import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localExtract } from "@/lib/extraction/local";
import { forecastFromEvidence, type ForecastContext } from "@/lib/forecasting";
import { buildCanonicalHybridSnapshot } from "@/lib/hybrid-likelihood/canonical";
import {
  calculateHybridLikelihood,
  estimateCycle,
  estimateCyclePressure,
  type HybridResetEvent,
  type HybridSignalInput,
  type StructuredSignal,
} from "@/lib/hybrid-likelihood";
import { createMilestoneCandidate } from "@/lib/milestones";
import { verifiedResetResolution } from "@/lib/reset-resolution";

const JULY_18_RESET = "2026-07-18T03:28:22Z";
const JULY_21_ANNOUNCEMENT = "2026-07-21T16:47:15Z";
const JULY_21_POST = "10M!\n\nNew day, new usage reset for paid users of Codex and ChatGPT Work. Lands in the next hour. Enjoy.";
const context: ForecastContext = {
  verifiedResets: [],
  milestoneObservations: [],
  historicalWindows: [],
  operationalSignals: [],
  nextPledgedMilestoneUsers: null,
};
const resetEvents: HybridResetEvent[] = [
  { id: "previous", occurredAt: "2026-07-17T03:28:22Z", resetType: "full", verified: true },
  { id: "july-18", occurredAt: JULY_18_RESET, resetType: "full", verified: true, sourcePostId: "2078320950488297917" },
  {
    id: "july-21",
    occurredAt: JULY_21_ANNOUNCEMENT,
    resetType: "scheduled",
    resolutionKind: "official_scheduled_announcement",
    verified: true,
    sourcePostId: "2079609157934886975",
  },
];

function structured(overrides: Partial<StructuredSignal>): StructuredSignal {
  return {
    signalType: "general_update",
    operationalRelevance: "moderate",
    resetIntentStrength: 0,
    operatorInterventionStrength: 0,
    timeImmediacy: "low",
    sourceAuthority: "monitored_official",
    extractionConfidence: .9,
    requiresReview: false,
    uncertainties: [],
    resetConfirmed: false,
    resetType: "none",
    policyScope: "none",
    policyPersistence: "none",
    ...overrides,
  };
}

const scheduledSignal: HybridSignalInput = {
  id: "extraction-july-21",
  postId: "2079609157934886975",
  text: JULY_21_POST,
  postedAt: JULY_21_ANNOUNCEMENT,
  sourceUrl: "https://x.com/thsottiaux/status/2079609157934886975",
  signal: structured({
    signalType: "near_term_reset_commitment",
    operationalRelevance: "high",
    resetIntentStrength: .96,
    timeImmediacy: "immediate",
    extractionConfidence: .96,
    resetType: "scheduled",
  }),
  verificationStatus: "verified",
};

describe("July 21 scheduled announcement resolution", () => {
  it("detects the exact 10M announcement without calling it completed execution", () => {
    const extraction = localExtract(JULY_21_POST);
    expect(extraction).toMatchObject({
      is_relevant: true,
      event_type: "milestone_commitment",
      signal_type: "near_term_reset_commitment",
      reset_type: "scheduled",
      time_immediacy: "immediate",
      requires_review: false,
      reset_confirmed: false,
    });
    const signal = structured({
      signalType: extraction.signal_type,
      operationalRelevance: extraction.operational_relevance,
      resetIntentStrength: extraction.reset_intent_strength,
      operatorInterventionStrength: extraction.operator_intervention_strength,
      timeImmediacy: extraction.time_immediacy,
      extractionConfidence: extraction.extraction_confidence,
      requiresReview: extraction.requires_review,
      resetConfirmed: extraction.reset_confirmed,
      resetType: extraction.reset_type,
      policyScope: extraction.policy_scope,
      policyPersistence: extraction.policy_persistence,
    });
    expect(verifiedResetResolution({
      text: JULY_21_POST,
      signal,
      storedConfidence: extraction.extraction_confidence,
      storedRequiresReview: extraction.requires_review,
    })).toEqual({
      resetType: "scheduled",
      resolutionKind: "official_scheduled_announcement",
      verificationMethod: "deterministic_scheduled_announcement_v1",
    });
    expect(createMilestoneCandidate({
      text: JULY_21_POST,
      sourcePostId: "2079609157934886975",
      sourceUrl: "https://x.com/thsottiaux/status/2079609157934886975",
      sourceAccount: "thsottiaux",
      announcedAt: JULY_21_ANNOUNCEMENT,
      latestVerifiedUsers: 9_000_000,
    })).toMatchObject({
      reportedActiveUsers: 10_000_000,
      denominator: "codex_and_chatgpt_work",
      resetType: "scheduled",
      executionAt: null,
      verificationStatus: "verified",
    });
  });

  it("resolves the prior announcement forecast and begins the new cycle at publication", () => {
    const snapshot = buildCanonicalHybridSnapshot({
      cutoff: JULY_21_ANNOUNCEMENT,
      evidence: [],
      signals: [scheduledSignal],
      resetEvents,
      context,
      simulations: 80,
      seed: 17,
    });
    expect(snapshot.hybrid).toMatchObject({
      cycleStartAt: JULY_21_ANNOUNCEMENT,
      previousCycleResolvedAt: JULY_21_ANNOUNCEMENT,
      eventResolutionStatus: "resolved",
      cycleMaturity: 0,
      cyclePressureChannel: 0,
      appliedOverride: null,
    });
    expect(snapshot.hybrid.watchScore).not.toBe(95);
    expect(snapshot.hybrid.activeSignals.find(item => item.postId === scheduledSignal.postId)).toMatchObject({
      direction: "confirmed",
      readinessValue: 0,
      exclusionReason: "previous_cycle_resolved",
    });
  });
});

describe("independent operational cycle pressure", () => {
  it("starts at zero, rises monotonically, stays bounded, and works with no policy", () => {
    const expected = estimateCycle(resetEvents.slice(0, 2), JULY_18_RESET).expectedCycleHours;
    const ratios = [0, .1, .25, .5, 1, 1.5, 3];
    const pressures = ratios.map(ratio => {
      const now = new Date(Date.parse(JULY_18_RESET) + ratio * expected * 3_600_000).toISOString();
      return estimateCyclePressure(estimateCycle(resetEvents.slice(0, 2), now), 36).channel;
    });
    expect(pressures[0]).toBe(0);
    expect(pressures.every((value, index) => value >= 0 && value <= 1 && (index === 0 || value >= pressures[index - 1]))).toBe(true);

    const now = new Date(Date.parse(JULY_18_RESET) + expected * .5 * 3_600_000).toISOString();
    const forecast = { ...forecastFromEvidence([], now, 36, 80, 17), probability: .02, credibleIntervalLow: .01, credibleIntervalHigh: .05 };
    const hybrid = calculateHybridLikelihood({ forecast, resetEvents: resetEvents.slice(0, 2), signals: [], now });
    expect(hybrid.policyRegimeState).toBe("inactive");
    expect(hybrid.policyTimingChannel).toBe(0);
    expect(hybrid.cyclePressureChannel).toBeGreaterThan(hybrid.timingChannel);
    expect(hybrid.maxWinningChannel).toBe("cycle_pressure");
  });

  it("uses max fusion without changing or mutating the calibrated forecast", () => {
    const now = "2026-07-19T03:28:22Z";
    const forecast = { ...forecastFromEvidence([], now, 36, 80, 17), probability: .123456789, credibleIntervalLow: .04, credibleIntervalHigh: .25 };
    const before = JSON.stringify(forecast);
    const policy: HybridSignalInput = {
      id: "policy",
      postId: "policy",
      text: "The resets will continue",
      postedAt: "2026-07-18T02:00:00Z",
      sourceUrl: "https://x.com/i/status/policy",
      signal: structured({
        signalType: "reset_policy_continuation",
        operationalRelevance: "high",
        resetIntentStrength: .9,
        extractionConfidence: .92,
        policyScope: "ongoing",
        policyPersistence: "active",
      }),
      verificationStatus: "verified",
    };
    const hybrid = calculateHybridLikelihood({ forecast, resetEvents: resetEvents.slice(0, 2), signals: [policy], now });
    const rawMaximum = Math.max(hybrid.timingChannel, hybrid.cyclePressureChannel, hybrid.policyTimingChannel, hybrid.strongestSignalChannel);
    expect(hybrid.watchScore).toBe(Math.round(rawMaximum * (1 - hybrid.negativePenalty) * 100));
    expect(hybrid.calibratedProbability).toBe(.123456789);
    expect(JSON.stringify(forecast)).toBe(before);
  });

  it("keeps all canonical consumers wired to the same cycle-pressure fields without provider calls", () => {
    const api = readFileSync("src/app/api/hybrid/current/route.ts", "utf8");
    const page = readFileSync("src/app/page.tsx", "utf8");
    const inspector = readFileSync("scripts/hybrid-inspect-current.ts", "utf8");
    const dataLab = readFileSync("src/app/lab/data/page.tsx", "utf8");
    const canonical = readFileSync("src/lib/canonical-hybrid-snapshot.ts", "utf8");
    const publicData = readFileSync("src/lib/public-data.ts", "utf8");
    expect(api).toContain("getPublicSnapshot");
    expect(page).toContain("getPublicSnapshot");
    expect(publicData).toContain("loadCanonicalHybridSnapshot");
    expect(inspector).toContain("loadCanonicalHybridSnapshot");
    expect(inspector).toContain("cyclePressureChannel");
    expect(dataLab).toContain("cyclePressureChannel");
    expect(canonical).not.toMatch(/XApiSourceAdapter|extractWithOpenAI|openai/i);
  });
});
