import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Evidence } from "../src/lib/forecasting";
import { baselineProbabilities, binaryMetrics, eventResults, generateCutoffs, hasCompleteOutcomeHorizon, type RollingRow, type VerifiedAnnouncement } from "../src/lib/month-backtest";
import { policyForecast, MODEL_V2_VERSION, type MilestoneObservation } from "../src/lib/forecasting/v2";
import ledger from "../src/data/verified-reset-ledger.json";

type RawPost = { id: string; text: string; createdAt: string; url: string };
type RawCache = { complete: boolean; from: string; to: string; xResourcesRead: number; posts: RawPost[]; verifiedAnnouncements: VerifiedAnnouncement[] };
type ExtractionCache = { openAICalls: number; records: Record<string, { extraction: { is_relevant: boolean; event_type: Evidence["eventType"]; extraction_confidence: number; requires_review: boolean; commitment_strength: number; milestone_current: number | null; milestone_target: number | null; incident_strength: number; capacity_concern: number; promotional_signal: number }; forecastImpact: number; excludedAsAmbiguous: boolean }> };
type V2RollingRow = RollingRow & { modelVersion: string; policyProbability: number; discretionaryProbability: number; alertBand: string; nextTargetUsers: number | null; interval: ReturnType<typeof policyForecast>["interval"]; posterior: ReturnType<typeof policyForecast>["posterior"] };
type V1RollingCache = { strictPreAnnouncement: RollingRow[] };

const ROOT = path.join(process.cwd(), "artifacts", "backtests", "2026-06-17_2026-07-17");
const OUTPUT = path.join(ROOT, "v2");
const readJson = async <T>(file: string) => JSON.parse(await readFile(file, "utf8")) as T;
const percent = (value: number | null) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;

function evidenceFromCache(raw: RawCache, cache: ExtractionCache): Evidence[] {
  return raw.posts.flatMap(post => { const record = cache.records[post.id]; if (!record || !record.extraction.is_relevant || record.excludedAsAmbiguous || record.extraction.requires_review || record.extraction.event_type === "irrelevant") return []; const item = record.extraction; return [{ id: `historical-${post.id}`, postId: post.id, postedAt: post.createdAt, excerpt: post.text, eventType: item.event_type, confidence: item.extraction_confidence, verified: true, sourceType: "official_x" as const, url: post.url, effect: record.forecastImpact, commitmentStrength: item.commitment_strength, milestoneCurrent: item.milestone_current, milestoneTarget: item.milestone_target, incidentStrength: item.incident_strength, capacityConcern: item.capacity_concern, promotionalSignal: item.promotional_signal }]; });
}

function milestones(): MilestoneObservation[] {
  return ledger.records.filter(item => item.verificationStatus === "verified").map(item => ({ users: item.milestoneUsers, announcedAt: item.eventAt, resetType: item.resetType as MilestoneObservation["resetType"] }));
}

function runRows(input: { cutoffs: string[]; evidence: Evidence[]; events: VerifiedAnnouncement[]; strict: boolean }): V2RollingRow[] {
  const excluded = new Set(input.strict ? input.evidence.filter(item => item.eventType === "explicit_reset_confirmation").map(item => item.postId) : []);
  return input.cutoffs.map(cutoff => {
    const visible = input.evidence.filter(item => Date.parse(item.postedAt) <= Date.parse(cutoff) && !excluded.has(item.postId));
    const result = policyForecast({ evidence: visible, milestones: milestones(), cutoff, horizonHours: 36, count: 5_000, seed: Number(process.env.MONTE_CARLO_SEED ?? 20260716) });
    const outcome = input.events.some(event => event.resetType !== "announcement_only" && Date.parse(event.announcedAt) > Date.parse(cutoff) && Date.parse(event.announcedAt) <= Date.parse(cutoff) + 36 * 3_600_000);
    const strongestFeatures = [
      { name: "milestone_arrival_pressure", contribution: result.interval.conditionalArrivalProbability },
      { name: "reset_given_milestone_posterior", contribution: result.posterior.mean },
      { name: "recent_milestone_regime", contribution: result.interval.regimeWeight },
    ].sort((left, right) => right.contribution - left.contribution);
    return { cutoff, test: input.strict ? "strict_pre_announcement" : "realtime", probability: result.probability, low: result.low, high: result.high, outcome, evidenceIds: result.evidenceIds, features: result.features, strongestFeatures, baselines: baselineProbabilities(result.baselineFeatures), modelVersion: result.modelVersion, policyProbability: result.policyProbability, discretionaryProbability: result.discretionaryProbability, alertBand: result.alertBand, nextTargetUsers: result.nextTargetUsers, interval: result.interval, posterior: result.posterior };
  });
}

async function main() {
  const raw = await readJson<RawCache>(path.join(ROOT, "raw-posts.json"));
  const extraction = await readJson<ExtractionCache>(path.join(ROOT, "extraction-cache.json"));
  if (!raw.complete) throw new Error("The cached historical timeline is incomplete; refusing external acquisition");
  const evidence = evidenceFromCache(raw, extraction);
  const cutoffs = generateCutoffs(raw.from, raw.to, 6);
  const realtime = runRows({ cutoffs, evidence, events: raw.verifiedAnnouncements, strict: false });
  const strict = runRows({ cutoffs, evidence, events: raw.verifiedAnnouncements, strict: true });
  const scoredRealtime = realtime.filter(row => hasCompleteOutcomeHorizon(row.cutoff, raw.to, 36));
  const scoredStrict = strict.filter(row => hasCompleteOutcomeHorizon(row.cutoff, raw.to, 36));
  const v2Realtime = binaryMetrics(scoredRealtime);
  const v2Strict = binaryMetrics(scoredStrict);
  const v2Events = eventResults(strict, raw.verifiedAnnouncements);
  const v1Rolling = await readJson<V1RollingCache>(path.join(ROOT, "rolling-forecasts.json"));
  const scoredV1Strict = v1Rolling.strictPreAnnouncement.filter(row => hasCompleteOutcomeHorizon(row.cutoff, raw.to, 36));
  const v1Strict = binaryMetrics(scoredV1Strict);
  const v1Events = eventResults(v1Rolling.strictPreAnnouncement, raw.verifiedAnnouncements);
  const v1FalseAlarms = scoredV1Strict.filter(row => !row.outcome).sort((a, b) => b.probability - a.probability).slice(0, 5);
  const v2FalseAlarms = scoredStrict.filter(row => !row.outcome).sort((a, b) => b.probability - a.probability).slice(0, 5);
  const beatsV1 = v2Strict.brierScore < v1Strict.brierScore;
  const beatsConstant = v2Strict.brierScore <= v2Strict.baselineBrierScore;
  const eligibleForDefault = beatsV1 && beatsConstant;
  const current = strict.at(-1)!;
  const baselines = {
    constantBaseRate: v2Strict.baselineBrierScore,
    timeSinceLastReset: v2Strict.baselineScores.timeSinceReset,
    milestoneOnly: v2Strict.baselineScores.milestoneProximity,
    cooldownAndMilestone: v2Strict.baselineScores.cooldownMilestone,
  };
  const comparison = { version: MODEL_V2_VERSION, rollingCutoffs: cutoffs.length, scoredCutoffs: scoredStrict.length, rightCensoredCutoffs: cutoffs.length - scoredStrict.length, v1: { modelVersion: "reset-oracle-1.1.0", metrics: v1Strict, events: v1Events, falseAlarms: v1FalseAlarms }, v2: { modelVersion: MODEL_V2_VERSION, metrics: v2Strict, events: v2Events, falseAlarms: v2FalseAlarms }, baselines, conclusions: { beatsV1, beatsConstantBaseline: beatsConstant, beatsEverySimpleBaseline: Object.values(baselines).every(score => v2Strict.brierScore < score), eligibleForProductionDefault: eligibleForDefault, label: eligibleForDefault ? "Policy-aware expert prior — Promising but unvalidated" : "Experimental policy model" } };
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(path.join(OUTPUT, "rolling-forecasts.json"), `${JSON.stringify({ version: MODEL_V2_VERSION, realtime, strictPreAnnouncement: strict }, null, 2)}\n`);
  await writeFile(path.join(OUTPUT, "event-results.json"), `${JSON.stringify({ version: MODEL_V2_VERSION, events: v2Events, fiveHighestFalseAlarms: v2FalseAlarms }, null, 2)}\n`);
  await writeFile(path.join(OUTPUT, "metrics.json"), `${JSON.stringify({ version: MODEL_V2_VERSION, evaluationPeriod: { from: raw.from, to: raw.to, stepHours: 6, horizonHours: 36 }, rollingCutoffs: cutoffs.length, scoredCutoffs: scoredStrict.length, rightCensoredCutoffs: cutoffs.length - scoredStrict.length, realtime: v2Realtime, strictPreAnnouncement: v2Strict, currentSnapshot: current, beatsV1, beatsConstantBaseline: beatsConstant, productionDefaultEligible: eligibleForDefault, interpretation: eligibleForDefault ? "Promising but unvalidated" : "No demonstrated predictive value", verifiedEventCount: raw.verifiedAnnouncements.length }, null, 2)}\n`);
  await writeFile(path.join(OUTPUT, "v1-v2-comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  const report = `# Reset Oracle v2 policy-model report

Model: ${MODEL_V2_VERSION}

## Formula

P(policy reset) = P(next pledged milestone within 36h | survived to elapsed) × P(reset announcement | milestone).

P(total) = 1 − (1 − P(policy reset)) × (1 − P(discretionary reset)).

The policy branch uses a recency-aware log-normal renewal mixture. One trailing short interval receives 0.68 recent-regime weight, two receive 0.86, and three or more receive 0.93. The Beta(1,1) reset posterior is updated only by milestones completed before each cutoff. Discretionary cooldown never suppresses policy risk.

## Strict pre-announcement comparison

| Model | Brier | Base-rate Brier | Skill | Log loss | ROC AUC | Average precision |
|---|---:|---:|---:|---:|---:|---:|
| v1 | ${v1Strict.brierScore.toFixed(4)} | ${v1Strict.baselineBrierScore.toFixed(4)} | ${v1Strict.brierSkillScore?.toFixed(4)} | ${v1Strict.logLoss.toFixed(4)} | ${v1Strict.rocAuc?.toFixed(4)} | ${v1Strict.averagePrecision?.toFixed(4)} |
| v2 | ${v2Strict.brierScore.toFixed(4)} | ${v2Strict.baselineBrierScore.toFixed(4)} | ${v2Strict.brierSkillScore?.toFixed(4)} | ${v2Strict.logLoss.toFixed(4)} | ${v2Strict.rocAuc?.toFixed(4)} | ${v2Strict.averagePrecision?.toFixed(4)} |

V2 ${beatsV1 ? "beats" : "does not beat"} v1 and ${beatsConstant ? "meets or beats" : "does not beat"} the constant baseline. Production-default eligibility: **${eligibleForDefault ? "yes" : "no"}**.

The command generated ${cutoffs.length} six-hour forecasts and scored ${scoredStrict.length}. The final ${cutoffs.length - scoredStrict.length} horizons cross the evaluation boundary and are retained as forecasts but excluded from metrics and false-alarm counts rather than being mislabeled as negative outcomes.

### Simple baseline Brier scores

| Baseline | Brier |
|---|---:|
| Constant base rate | ${baselines.constantBaseRate.toFixed(4)} |
| Time since last reset | ${baselines.timeSinceLastReset.toFixed(4)} |
| Milestone proximity only | ${baselines.milestoneOnly.toFixed(4)} |
| Cooldown + milestone | ${baselines.cooldownAndMilestone.toFixed(4)} |

## Current cached-period snapshot

- Policy-driven risk: ${percent(current.policyProbability)}
- Signal-driven risk: ${percent(current.discretionaryProbability)}
- Combined risk: ${percent(current.probability)}
- Next pledged target: ${current.nextTargetUsers ? `${current.nextTargetUsers / 1_000_000}M` : "none; policy fulfilled or unavailable"}
- Recent interval median: ${current.interval.recentMedianHours?.toFixed(1) ?? "unavailable"} hours
- Long-term interval median: ${current.interval.longTermMedianHours?.toFixed(1) ?? "unavailable"} hours
- Regime weight: ${current.interval.regimeWeight.toFixed(2)}
- Reset-given-milestone posterior: ${current.posterior.mean.toFixed(3)} (${current.posterior.successes} successes, ${current.posterior.failures} failures)

## Event results

| Event | Maximum pre-announcement | 36h before | 24h before | 12h before | 6h before |
|---|---:|---:|---:|---:|---:|
${v2Events.map(event => `| ${event.eventTimestamp} | ${percent(event.maximumPreAnnouncementProbability)} | ${percent(event.probability36HoursBefore)} | ${percent(event.probability24HoursBefore)} | ${percent(event.probability12HoursBefore)} | ${percent(event.probability6HoursBefore)} |`).join("\n")}

### Earliest threshold crossings

| Event | 30% | 50% | 60% | 70% | 80% |
|---|---:|---:|---:|---:|---:|
${v2Events.map(event => `| ${event.eventTimestamp} | ${event.thresholdCrossings["0.3"]?.leadHours.toFixed(1) ?? "not reached"} | ${event.thresholdCrossings["0.5"]?.leadHours.toFixed(1) ?? "not reached"} | ${event.thresholdCrossings["0.6"]?.leadHours.toFixed(1) ?? "not reached"} | ${event.thresholdCrossings["0.7"]?.leadHours.toFixed(1) ?? "not reached"} | ${event.thresholdCrossings["0.8"]?.leadHours.toFixed(1) ?? "not reached"} |`).join("\n")}

### Highest-probability false-alarm windows

| Cutoff | Probability | Policy branch | Signal branch |
|---|---:|---:|---:|
${v2FalseAlarms.map(row => `| ${row.cutoff} | ${percent(row.probability)} | ${percent(row.policyProbability)} | ${percent(row.discretionaryProbability)} |`).join("\n")}

Historical simulation, not a guarantee of future resets. The evaluation contains only four verified announcements.
`;
  await writeFile(path.join(OUTPUT, "MODEL_V2_REPORT.md"), report);
  console.log({ externalCalls: 0, rollingCutoffs: cutoffs.length, scoredCutoffs: scoredStrict.length, rightCensoredCutoffs: cutoffs.length - scoredStrict.length, currentPolicyProbability: current.policyProbability, currentDiscretionaryProbability: current.discretionaryProbability, currentCombinedProbability: current.probability, v1Brier: v1Strict.brierScore, v2Brier: v2Strict.brierScore, baselineBrier: v2Strict.baselineBrierScore, brierSkill: v2Strict.brierSkillScore, beatsV1, beatsConstantBaseline: beatsConstant, productionDefaultEligible: eligibleForDefault });
}

void main().catch(error => { console.error({ ok: false, error: error instanceof Error ? error.message : "V2 cached backtest failed" }); process.exitCode = 1; });
