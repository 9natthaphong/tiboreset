import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { localExtract } from "../src/lib/extraction/local";
import { ExtractionSchema, type Extraction } from "../src/lib/extraction/schema";
import { enforceExtractionSafety } from "../src/lib/extraction/safety";
import { extractRelevantWithFallback } from "../src/lib/extraction/openai";
import { deterministicForecastImpact } from "../src/lib/ingestion";
import type { Evidence } from "../src/lib/forecasting";
import { MONTH_BACKTEST_VERSION, binaryMetrics, eventResults, generateCutoffs, mergeUniquePosts, requiresExternalAcquisition, runWalkForward, type VerifiedAnnouncement } from "../src/lib/month-backtest";
import ledger from "../src/data/verified-reset-ledger.json";

loadEnvConfig(process.cwd());

type Args = { from: string; to: string; stepHours: number; horizonHours: number; refresh: boolean };
type NormalizedPost = { id: string; text: string; createdAt: string; url: string; publicMetrics: Record<string, number>; referencedTypes: string[] };
type RawCache = { version: string; complete: boolean; from: string; to: string; xResourcesRead: number; nextToken: string | null; fetchedPageKeys: string[]; posts: NormalizedPost[]; audit: Record<string, unknown>; verifiedAnnouncements: VerifiedAnnouncement[]; existingExtractions: Record<string, Record<string, unknown>> };
type CachedExtraction = { postId: string; localRelevant: boolean; source: "screened_negative" | "existing" | "openai" | "local" | "local_fallback"; extraction: Extraction; forecastImpact: number; excludedAsAmbiguous: boolean };
type ExtractionCache = { version: string; openAICalls: number; records: Record<string, CachedExtraction> };

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "backtests", "2026-06-17_2026-07-17");
const RAW_PATH = path.join(OUTPUT_ROOT, "raw-posts.json");
const EXTRACTION_PATH = path.join(OUTPUT_ROOT, "extraction-cache.json");

function parseArgs(argv: string[]): Args {
  const read = (name: string, fallback: string) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
  const result = { from: read("--from", "2026-06-17T00:00:00Z"), to: read("--to", "2026-07-17T00:00:00Z"), stepHours: Number(read("--step-hours", "6")), horizonHours: Number(read("--horizon-hours", "36")), refresh: argv.includes("--refresh") };
  if (!Number.isFinite(Date.parse(result.from)) || !Number.isFinite(Date.parse(result.to)) || Date.parse(result.from) >= Date.parse(result.to)) throw new Error("Invalid evaluation period");
  if (!Number.isInteger(result.stepHours) || result.stepHours <= 0 || !Number.isInteger(result.horizonHours) || result.horizonHours <= 0) throw new Error("Invalid step or horizon");
  return result;
}

async function readJson<T>(file: string): Promise<T | null> { if (!existsSync(file)) return null; return JSON.parse(await readFile(file, "utf8")) as T; }
async function atomicJson(file: string, value: unknown) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, file); }

function verifiedAnnouncements(from: string, to: string): VerifiedAnnouncement[] {
  return ledger.records.filter(record => record.verificationStatus === "verified" && Date.parse(record.eventAt) >= Date.parse(from) && Date.parse(record.eventAt) < Date.parse(to)).map(record => ({ id: record.canonicalId, announcedAt: record.eventAt, resetType: record.resetType as VerifiedAnnouncement["resetType"], milestoneUsers: record.milestoneUsers, sourcePostId: record.sourcePostId, sourceUrl: record.sourceUrl, executionAt: null, executionVerified: false }));
}

async function productionAudit(client: SupabaseClient, args: Args) {
  const [first, last, inside, events, resets, milestones, account] = await Promise.all([
    client.from("source_posts").select("posted_at").order("posted_at", { ascending: true }).limit(1).maybeSingle(),
    client.from("source_posts").select("posted_at").order("posted_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("source_posts").select("*", { count: "exact", head: true }).gte("posted_at", args.from).lt("posted_at", args.to),
    client.from("extracted_events").select("*", { count: "exact", head: true }),
    client.from("known_reset_events").select("id", { count: "exact", head: true }).eq("verified", true).gte("occurred_at", args.from).lt("occurred_at", args.to),
    client.from("milestone_events").select("id", { count: "exact", head: true }).eq("verification_status", "verified").gte("announced_at", args.from).lt("announced_at", args.to),
    client.from("monitored_accounts").select("id,platform_user_id,username").eq("platform", "x").eq("username", process.env.X_USERNAME ?? "thsottiaux").maybeSingle(),
  ]);
  for (const result of [first, last, inside, events, resets, milestones, account]) if (result.error) throw result.error;
  return { earliestStoredPost: first.data?.posted_at ?? null, latestStoredPost: last.data?.posted_at ?? null, storedPostsInPeriod: inside.count ?? 0, totalExtractedEvents: events.count ?? 0, verifiedResetEventsInPeriod: resets.count ?? 0, verifiedMilestonesInPeriod: milestones.count ?? 0, sufficientForStrictMonth: (inside.count ?? 0) >= 50, accountId: account.data?.platform_user_id ? String(account.data.platform_user_id) : null };
}

async function existingExtractions(client: SupabaseClient, from: string, to: string) {
  const posts = await client.from("source_posts").select("id,platform_post_id").gte("posted_at", from).lt("posted_at", to);
  if (posts.error) throw posts.error;
  const ids = (posts.data ?? []).map(row => String(row.id));
  if (!ids.length) return {};
  const events = await client.from("extracted_events").select("source_post_id,event_payload,requires_review,event_type,extraction_confidence").in("source_post_id", ids).order("created_at", { ascending: false });
  if (events.error) throw events.error;
  const platformByDatabaseId = new Map((posts.data ?? []).map(row => [String(row.id), String(row.platform_post_id)]));
  const result: Record<string, Record<string, unknown>> = {};
  for (const event of events.data ?? []) { const platformId = platformByDatabaseId.get(String(event.source_post_id)); if (platformId && !result[platformId]) result[platformId] = { ...(event.event_payload as Record<string, unknown>), requires_review: event.requires_review, event_type: event.event_type, extraction_confidence: event.extraction_confidence }; }
  return result;
}

async function xRequest(url: string, token: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`X API historical request failed (${response.status})`);
  return await response.json() as { data?: Array<{ id: string; text: string; created_at: string; public_metrics?: Record<string, number>; referenced_tweets?: Array<{ type: string }> }>; meta?: { next_token?: string } };
}

async function acquireTimeline(args: Args, cache: RawCache, token: string, accountId: string) {
  if (cache.complete && !args.refresh) return cache;
  if (args.refresh) cache = { ...cache, complete: false, xResourcesRead: 0, nextToken: null, fetchedPageKeys: [], posts: [] };
  while (!cache.complete) {
    const remaining = 500 - cache.xResourcesRead;
    if (remaining < 5) throw new Error("Historical X resource cap reached before the evaluation start date");
    const pageKey = cache.nextToken ?? "initial";
    if (cache.fetchedPageKeys.includes(pageKey)) throw new Error("Refusing to fetch a previously cached X page");
    const query = new URLSearchParams({ max_results: String(Math.min(100, remaining)), end_time: args.to, "tweet.fields": "created_at,public_metrics,referenced_tweets" });
    if (cache.nextToken) query.set("pagination_token", cache.nextToken);
    const response = await xRequest(`https://api.x.com/2/users/${encodeURIComponent(accountId)}/tweets?${query}`, token);
    const posts = (response.data ?? []).map(post => ({ id: post.id, text: post.text, createdAt: post.created_at, url: `https://x.com/i/status/${post.id}`, publicMetrics: post.public_metrics ?? {}, referencedTypes: (post.referenced_tweets ?? []).map(item => item.type) }));
    cache.xResourcesRead += posts.length;
    cache.posts = mergeUniquePosts(cache.posts, posts);
    cache.fetchedPageKeys.push(pageKey);
    cache.nextToken = response.meta?.next_token ?? null;
    const oldest = cache.posts.reduce((value, post) => Math.min(value, Date.parse(post.createdAt)), Number.POSITIVE_INFINITY);
    cache.complete = oldest <= Date.parse(args.from) || !cache.nextToken;
    await atomicJson(RAW_PATH, cache);
    if (cache.xResourcesRead >= 500 && !cache.complete) throw new Error("Historical X resource cap reached before the evaluation start date");
  }
  cache.posts = cache.posts.filter(post => Date.parse(post.createdAt) >= Date.parse(args.from) && Date.parse(post.createdAt) < Date.parse(args.to)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  await atomicJson(RAW_PATH, cache);
  return cache;
}

function normalizeExisting(payload: Record<string, unknown>, local: Extraction): Extraction {
  const keys = Object.keys(local) as Array<keyof Extraction>;
  const values = Object.fromEntries(keys.flatMap(key => key in payload ? [[key, payload[key]]] : []));
  return ExtractionSchema.parse({ ...local, ...values });
}

async function extractTimeline(raw: RawCache, refresh: boolean) {
  let cache = refresh ? null : await readJson<ExtractionCache>(EXTRACTION_PATH);
  cache ??= { version: MONTH_BACKTEST_VERSION, openAICalls: 0, records: {} };
  for (const post of raw.posts) {
    if (cache.records[post.id]) continue;
    const local = localExtract(post.text);
    if (!local.is_relevant) {
      cache.records[post.id] = { postId: post.id, localRelevant: false, source: "screened_negative", extraction: local, forecastImpact: 0, excludedAsAmbiguous: false };
      await atomicJson(EXTRACTION_PATH, cache);
      continue;
    }
    let extraction: Extraction;
    let source: CachedExtraction["source"];
    const existing = raw.existingExtractions[post.id];
    if (existing) { extraction = normalizeExisting(existing, local); source = "existing"; }
    else if (cache.openAICalls < 50) {
      const result = await extractRelevantWithFallback(post.text, local);
      extraction = result.extraction;
      source = result.source === "openai" ? "openai" : result.source === "local_fallback" ? "local_fallback" : "local";
      if (result.source === "openai") cache.openAICalls += 1;
    } else { extraction = local; source = "local"; }
    extraction = enforceExtractionSafety(post.text, extraction);
    cache.records[post.id] = { postId: post.id, localRelevant: true, source, extraction, forecastImpact: deterministicForecastImpact(extraction), excludedAsAmbiguous: extraction.requires_review };
    await atomicJson(EXTRACTION_PATH, cache);
  }
  return cache;
}

function evidenceFromCache(raw: RawCache, cache: ExtractionCache): Evidence[] {
  return raw.posts.flatMap(post => {
    const record = cache.records[post.id];
    if (!record || !record.extraction.is_relevant || record.excludedAsAmbiguous || record.extraction.event_type === "irrelevant") return [];
    const item = record.extraction;
    return [{ id: `historical-${post.id}`, postId: post.id, postedAt: post.createdAt, excerpt: post.text, eventType: item.event_type, confidence: item.extraction_confidence, verified: !item.requires_review, sourceType: "official_x" as const, url: post.url, effect: record.forecastImpact, commitmentStrength: item.commitment_strength, milestoneCurrent: item.milestone_current, milestoneTarget: item.milestone_target, incidentStrength: item.incident_strength, capacityConcern: item.capacity_concern, promotionalSignal: item.promotional_signal }];
  });
}

function reportMarkdown(input: { args: Args; raw: RawCache; extraction: ExtractionCache; realtimeMetrics: ReturnType<typeof binaryMetrics>; strictMetrics: ReturnType<typeof binaryMetrics>; events: ReturnType<typeof eventResults>; interpretation: string; beatBaselines: boolean }) {
  const percent = (value: number | null) => value == null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
  return `# Reset Oracle one-month walk-forward backtest\n\nReport version: ${MONTH_BACKTEST_VERSION}\n\n## Scope\n\n- Evaluation: ${input.args.from} through ${input.args.to}\n- Step: ${input.args.stepHours} hours\n- Horizon: ${input.args.horizonHours} hours\n- Frozen production model; 5,000 seeded simulations per cutoff\n- X resources read: ${input.raw.xResourcesRead}\n- OpenAI extraction calls: ${input.extraction.openAICalls}\n\n## Primary result\n\n**${input.interpretation}**\n\nThe strict pre-announcement test produced a Brier score of ${input.strictMetrics.brierScore.toFixed(4)} versus ${input.strictMetrics.baselineBrierScore.toFixed(4)} for the constant base-rate baseline (skill ${input.strictMetrics.brierSkillScore?.toFixed(4) ?? "unavailable"}). The model ${input.beatBaselines ? "beat" : "did not beat"} every listed simple baseline.\n\nOne month and ${input.events.length} reset announcements cannot establish general reliability. This is a historical simulation, not a guarantee of future resets.\n\n## Data audit\n\n- Earliest production post before acquisition: ${input.raw.audit.earliestStoredPost ?? "none"}\n- Latest production post before acquisition: ${input.raw.audit.latestStoredPost ?? "none"}\n- Production posts inside period: ${input.raw.audit.storedPostsInPeriod}\n- Historical posts evaluated: ${input.raw.posts.length}\n- Verified announcement outcomes: ${input.events.length}\n- Verified execution target: unavailable; the reviewed ledger does not assert separate execution timestamps\n\n## Test separation\n\nReal-time observable forecasts include confirmation detection after an announcement becomes public. Strict forecasts exclude verified target announcement posts and direct confirmation evidence from the evaluation month. Metrics are not mixed.\n\n## Strict metrics\n\n- Cutoffs: ${input.strictMetrics.cutoffs}\n- Positive windows: ${input.strictMetrics.positiveWindows}\n- Negative windows: ${input.strictMetrics.negativeWindows}\n- Event base rate: ${percent(input.strictMetrics.eventBaseRate)}\n- Brier score: ${input.strictMetrics.brierScore.toFixed(4)}\n- Constant baseline Brier: ${input.strictMetrics.baselineBrierScore.toFixed(4)}\n- Brier skill: ${input.strictMetrics.brierSkillScore?.toFixed(4) ?? "unavailable"}\n- Log loss: ${input.strictMetrics.logLoss.toFixed(4)}\n- ROC AUC: ${input.strictMetrics.rocAuc?.toFixed(4) ?? "mathematically unavailable"}\n- Average precision: ${input.strictMetrics.averagePrecision?.toFixed(4) ?? "mathematically unavailable"}\n\n## Thresholds\n\n| Threshold | Precision | Recall | False positives | False negatives |\n|---:|---:|---:|---:|---:|\n${input.strictMetrics.thresholds.map(row => `| ${percent(row.threshold)} | ${percent(row.precision)} | ${percent(row.recall)} | ${row.falsePositives} | ${row.falseNegatives} |`).join("\n")}\n\n## Event-by-event\n\n| Event | Type | Milestone | Maximum pre-announcement | Predicted above 50% |\n|---|---|---:|---:|---|\n${input.events.map(event => `| ${event.eventTimestamp} | ${event.eventType} | ${event.milestoneUsers ? `${event.milestoneUsers / 1_000_000}M` : "n/a"} | ${percent(event.maximumPreAnnouncementProbability)} | ${event.predictedBeforePublication ? "Yes" : "No"} |`).join("\n")}\n\n## Interpretation guardrail\n\n${input.interpretation === "Insufficient data" ? "There are too few independent reset events to make a public accuracy claim." : "Any signal must still be treated as preliminary because the evaluation covers only one month."}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(OUTPUT_ROOT, { recursive: true });
  let raw = args.refresh ? null : await readJson<RawCache>(RAW_PATH);
  if (requiresExternalAcquisition(raw, args.refresh)) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const xToken = process.env.X_BEARER_TOKEN;
    if (!url || !serviceKey || !xToken) throw new Error("Live Supabase and X credentials are required for the initial cached acquisition");
    const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const audit = await productionAudit(client, args);
    const announcements = verifiedAnnouncements(args.from, args.to);
    raw ??= { version: MONTH_BACKTEST_VERSION, complete: false, from: args.from, to: args.to, xResourcesRead: 0, nextToken: null, fetchedPageKeys: [], posts: [], audit, verifiedAnnouncements: announcements, existingExtractions: await existingExtractions(client, args.from, args.to) };
    if (!audit.accountId) throw new Error("Cached monitored X account ID is unavailable");
    raw = await acquireTimeline(args, raw, xToken, String(audit.accountId));
  }
  if (!raw) throw new Error("Historical timeline cache was not created");
  const extraction = await extractTimeline(raw, args.refresh);
  const evidence = evidenceFromCache(raw, extraction);
  const cutoffs = generateCutoffs(args.from, args.to, args.stepHours);
  const realtime = runWalkForward({ cutoffs, horizonHours: args.horizonHours, evidence, events: raw.verifiedAnnouncements, test: "realtime" });
  const targetIds = new Set(raw.verifiedAnnouncements.flatMap(event => event.sourcePostId ? [event.sourcePostId] : []));
  for (const item of evidence) if (item.eventType === "explicit_reset_confirmation") targetIds.add(item.postId);
  const strict = runWalkForward({ cutoffs, horizonHours: args.horizonHours, evidence, events: raw.verifiedAnnouncements, excludedPostIds: targetIds, test: "strict_pre_announcement" });
  const realtimeMetrics = binaryMetrics(realtime);
  const strictMetrics = binaryMetrics(strict);
  const events = eventResults(strict, raw.verifiedAnnouncements);
  const beatBaselines = strictMetrics.brierScore < strictMetrics.baselineBrierScore && Object.values(strictMetrics.baselineScores).every(score => strictMetrics.brierScore < score);
  const interpretation = raw.verifiedAnnouncements.length < 5 || strictMetrics.positiveWindows < 10 || strictMetrics.negativeWindows < 30 ? "Insufficient data" : !beatBaselines ? "No demonstrated predictive value" : strictMetrics.brierSkillScore != null && strictMetrics.brierSkillScore > 0 ? "Promising but unvalidated" : "Weak early signal";
  const falseAlarms = strict.filter(row => !row.outcome).sort((a, b) => b.probability - a.probability).slice(0, 5);
  const metrics = { version: MONTH_BACKTEST_VERSION, evaluationPeriod: { from: args.from, to: args.to, stepHours: args.stepHours, horizonHours: args.horizonHours }, targets: { officialResetAnnouncement: "available", verifiedResetExecution: "unavailable" }, realtime: realtimeMetrics, strictPreAnnouncement: strictMetrics, beatAllBaselines: beatBaselines, interpretation, verifiedEventCount: raw.verifiedAnnouncements.length, reportSufficientForPublicAccuracyClaim: false };
  await atomicJson(path.join(OUTPUT_ROOT, "rolling-forecasts.json"), { version: MONTH_BACKTEST_VERSION, realtime, strictPreAnnouncement: strict });
  await atomicJson(path.join(OUTPUT_ROOT, "event-results.json"), { version: MONTH_BACKTEST_VERSION, events, fiveHighestFalseAlarms: falseAlarms });
  await atomicJson(path.join(OUTPUT_ROOT, "metrics.json"), metrics);
  await writeFile(path.join(OUTPUT_ROOT, "BACKTEST_REPORT.md"), reportMarkdown({ args, raw, extraction, realtimeMetrics, strictMetrics, events, interpretation, beatBaselines }), "utf8");
  console.log({ audit: raw.audit, totalHistoricalPosts: raw.posts.length, locallyScreenedIrrelevant: Object.values(extraction.records).filter(item => !item.localRelevant).length, candidatePosts: Object.values(extraction.records).filter(item => item.localRelevant).length, openAIExtractionCalls: extraction.openAICalls, relevantEvidenceRecords: evidence.length, ambiguousRecordsExcluded: Object.values(extraction.records).filter(item => item.excludedAsAmbiguous).length, xPostResourcesRead: raw.xResourcesRead, rollingCutoffs: cutoffs.length, verifiedPositiveOutcomes: raw.verifiedAnnouncements.length, strictBrierScore: strictMetrics.brierScore, baselineBrierScore: strictMetrics.baselineBrierScore, brierSkillScore: strictMetrics.brierSkillScore, beatAllBaselines: beatBaselines, interpretation });
}

void main().catch(error => { console.error({ ok: false, error: error instanceof Error ? error.message : "Monthly backtest failed" }); process.exitCode = 1; });
