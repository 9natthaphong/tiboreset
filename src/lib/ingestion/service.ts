import type { Extraction } from "@/lib/extraction/schema";
import { refreshCurrentForecast } from "@/lib/forecasting/current-refresh";
import type { SocialPost, SocialSourceAdapter } from "@/lib/social/adapters";
import type { ExtractionResult, IngestionReport, IngestionRepository } from "./types";
import { createMilestoneCandidate } from "@/lib/milestones";
import { enforceExtractionSafety } from "@/lib/extraction/safety";

const MAX_X_POSTS_PER_RUN = 10;

function newestPostId(posts: SocialPost[], reported?: string): string | undefined {
  const ids = [...posts.map(post => post.id), ...(reported ? [reported] : [])];
  return ids.reduce<string | undefined>((newest, id) => !newest || BigInt(id) > BigInt(newest) ? id : newest, undefined);
}

export function deterministicForecastImpact(extraction: Extraction): number {
  if (!extraction.is_relevant || extraction.requires_review) return 0;
  const impacts: Record<Extraction["event_type"], number> = {
    explicit_reset_confirmation: 35,
    reset_hint: 8,
    milestone_commitment: 7,
    milestone_progress: 6,
    usage_incident: 3,
    capacity_signal: -4,
    limit_policy_change: 10,
    product_launch: 4,
    promotion: 5,
    community_poll: 2,
    general_codex_update: 0,
    irrelevant: 0,
  };
  return impacts[extraction.event_type];
}

export type IngestionDependencies = {
  repository: IngestionRepository;
  source: SocialSourceAdapter;
  username: string;
  localExtract: (text: string) => Extraction;
  extractRelevant: (text: string, localScreen: Extraction) => Promise<ExtractionResult>;
  now?: () => Date;
  horizonHours?: number;
};

export async function runIngestion(dependencies: IngestionDependencies): Promise<IngestionReport> {
  const now = dependencies.now ?? (() => new Date());
  const started = now();
  const startedAt = started.toISOString();
  const runId = await dependencies.repository.startRun({ source: "x", startedAt });
  let postsRead = 0;
  let postsInserted = 0;
  let postsAnalyzed = 0;
  let xResourcesConsumed = 0;
  let accountResolved = false;
  try {
    let account = await dependencies.repository.findAccount(dependencies.username);
    if (!account) {
      const resolved = await dependencies.source.resolveAccount(dependencies.username);
      xResourcesConsumed += 1;
      accountResolved = true;
      account = await dependencies.repository.upsertAccount(resolved);
    }
    const batch = await dependencies.source.fetchPosts({
      accountId: account.id,
      sinceId: account.latestProcessedPostId,
      maxResults: MAX_X_POSTS_PER_RUN,
    });
    postsRead = Math.min(MAX_X_POSTS_PER_RUN, batch.posts.length);
    xResourcesConsumed += postsRead;
    const uniquePosts = [...new Map(batch.posts.slice(0, MAX_X_POSTS_PER_RUN).map(post => [post.id, post])).values()];
    const existing = await dependencies.repository.findExistingPostIds(uniquePosts.map(post => post.id));
    for (const post of uniquePosts) {
      if (existing.has(post.id)) continue;
      const localScreen = dependencies.localExtract(post.text);
      const storedPost = await dependencies.repository.insertPost({ account, post, localScreen });
      postsInserted += 1;
      if (!localScreen.is_relevant) continue;
      const extracted = await dependencies.extractRelevant(post.text, localScreen);
      const result = { ...extracted, extraction: enforceExtractionSafety(post.text, extracted.extraction) };
      postsAnalyzed += 1;
      const forecastImpact = deterministicForecastImpact(result.extraction);
      await dependencies.repository.insertExtraction({ post: storedPost, result, forecastImpact });
      const latestVerifiedUsers = await dependencies.repository.getLatestVerifiedMilestoneUsers?.();
      const candidate = createMilestoneCandidate({
        text: post.text,
        sourcePostId: post.id,
        sourceUrl: post.url,
        sourceAccount: account.username,
        announcedAt: post.createdAt,
        latestVerifiedUsers,
      });
      if (candidate) await dependencies.repository.upsertMilestoneCandidate?.({ candidate, post: storedPost });
    }
    const forecastCalculatedAt = now().toISOString();
    const refresh = await refreshCurrentForecast({ repository: dependencies.repository, calculatedAt: forecastCalculatedAt, horizonHours: dependencies.horizonHours });
    const latestId = newestPostId(uniquePosts, batch.newestId);
    if (latestId) await dependencies.repository.updateLatestProcessedPostId(account.databaseId, latestId, now().toISOString());
    const completedAt = now().toISOString();
    const report: IngestionReport = {
      runId,
      status: "success",
      source: "x",
      accountResolved,
      postsRead,
      postsInserted,
      postsAnalyzed,
      forecastRecalculated: true,
      forecastChanged: refresh.forecastChanged,
      forecastSaveReason: refresh.forecastSaveReason,
      forecastCalculatedAt,
      forecastModelVersion: refresh.forecast.modelVersion,
      forecastId: refresh.forecastId,
      durationMs: Math.max(0, now().getTime() - started.getTime()),
      completedAt,
      xResourcesConsumed,
    };
    await dependencies.repository.completeRun(runId, report);
    return report;
  } catch (error) {
    const completedAt = now().toISOString();
    await dependencies.repository.failRun(runId, {
      completedAt,
      durationMs: Math.max(0, now().getTime() - started.getTime()),
      safeError: error instanceof Error ? error.message.slice(0, 300) : "Ingestion failed",
      postsRead,
      postsInserted,
      postsAnalyzed,
      xResourcesConsumed,
    });
    throw error;
  }
}

export { MAX_X_POSTS_PER_RUN };
