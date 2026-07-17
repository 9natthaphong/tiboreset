import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { honestBacktestStatus } from "@/lib/month-backtest";

const metricSchema = z.object({
  version: z.string(),
  evaluationPeriod: z.object({ from: z.string(), to: z.string(), stepHours: z.number(), horizonHours: z.number() }),
  strictPreAnnouncement: z.object({ cutoffs: z.number(), brierScore: z.number(), baselineBrierScore: z.number(), brierSkillScore: z.number().nullable(), calibration: z.array(z.object({ count: z.number(), meanProbability: z.number().nullable(), observedRate: z.number().nullable() })) }),
  currentSnapshot: z.object({ probability: z.number(), policyProbability: z.number(), discretionaryProbability: z.number(), nextTargetUsers: z.number().nullable(), interval: z.object({ recentMedianHours: z.number().nullable(), longTermMedianHours: z.number().nullable(), regimeWeight: z.number(), elapsedHours: z.number().nullable(), conditionalArrivalProbability: z.number() }), posterior: z.object({ successes: z.number(), failures: z.number(), mean: z.number(), conservativeInterval: z.tuple([z.number(), z.number()]) }) }).optional(),
  interpretation: z.enum(["Insufficient data", "No demonstrated predictive value", "Weak early signal", "Promising but unvalidated"]),
  verifiedEventCount: z.number(),
});
const eventSchema = z.object({ events: z.array(z.object({ predictedBeforePublication: z.boolean(), thresholdCrossings: z.record(z.string(), z.object({ leadHours: z.number() }).nullable()) })) });

export type PublicBacktestSummary = {
  version: string;
  from: string;
  to: string;
  sampleSize: number;
  brierScore: number;
  baselineBrierScore: number;
  brierSkillScore: number | null;
  resetsAbove50: number;
  medianLeadHours: number | null;
  calibrationStatus: string;
  interpretation: string;
  policySnapshot: { combinedProbability: number; policyProbability: number; discretionaryProbability: number; nextTargetUsers: number | null; recentMedianHours: number | null; longTermMedianHours: number | null; regimeWeight: number; elapsedHours: number | null; conditionalArrivalProbability: number; posteriorSuccesses: number; posteriorFailures: number; posteriorMean: number; posteriorInterval: [number, number] } | null;
};

export async function loadPublicBacktestSummary(): Promise<PublicBacktestSummary | null> {
  try {
    const root = path.join(process.cwd(), "artifacts", "backtests", "2026-06-17_2026-07-17");
    const [metricsRaw, eventsRaw] = await Promise.all([readFile(path.join(root, "v2", "metrics.json"), "utf8"), readFile(path.join(root, "v2", "event-results.json"), "utf8")]);
    const metrics = metricSchema.parse(JSON.parse(metricsRaw));
    const events = eventSchema.parse(JSON.parse(eventsRaw));
    const leads = events.events.flatMap(event => event.thresholdCrossings["0.5"]?.leadHours != null ? [event.thresholdCrossings["0.5"]!.leadHours] : []).sort((a, b) => a - b);
    const medianLeadHours = leads.length ? leads.length % 2 ? leads[Math.floor(leads.length / 2)] : (leads[leads.length / 2 - 1] + leads[leads.length / 2]) / 2 : null;
    const populatedCalibrationBins = metrics.strictPreAnnouncement.calibration.filter(row => row.count > 0);
    const snapshot = metrics.currentSnapshot;
    return { version: metrics.version, from: metrics.evaluationPeriod.from, to: metrics.evaluationPeriod.to, sampleSize: metrics.strictPreAnnouncement.cutoffs, brierScore: metrics.strictPreAnnouncement.brierScore, baselineBrierScore: metrics.strictPreAnnouncement.baselineBrierScore, brierSkillScore: metrics.strictPreAnnouncement.brierSkillScore, resetsAbove50: events.events.filter(event => event.predictedBeforePublication).length, medianLeadHours, calibrationStatus: populatedCalibrationBins.length < 3 ? "Too sparse to assess calibration" : "Calibration table available", interpretation: honestBacktestStatus({ interpretation: metrics.interpretation, brierSkillScore: metrics.strictPreAnnouncement.brierSkillScore }), policySnapshot: snapshot ? { combinedProbability: snapshot.probability, policyProbability: snapshot.policyProbability, discretionaryProbability: snapshot.discretionaryProbability, nextTargetUsers: snapshot.nextTargetUsers, recentMedianHours: snapshot.interval.recentMedianHours, longTermMedianHours: snapshot.interval.longTermMedianHours, regimeWeight: snapshot.interval.regimeWeight, elapsedHours: snapshot.interval.elapsedHours, conditionalArrivalProbability: snapshot.interval.conditionalArrivalProbability, posteriorSuccesses: snapshot.posterior.successes, posteriorFailures: snapshot.posterior.failures, posteriorMean: snapshot.posterior.mean, posteriorInterval: snapshot.posterior.conservativeInterval } : null };
  } catch { return null; }
}
