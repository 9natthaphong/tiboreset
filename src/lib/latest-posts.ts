import { z } from "zod";
import type { Evidence } from "@/lib/forecasting";
import type { LatestPost, LatestPostsResponse } from "@/lib/public-data-types";

export const latestPostsLimitSchema = z.coerce.number().int().min(1).max(20).default(6);

export function parseLatestPostsLimit(value: string | null | undefined): number {
  return latestPostsLimitSchema.parse(value ?? undefined);
}

export function sortAndDedupePosts(posts: LatestPost[], limit: number): LatestPost[] {
  return posts
    .slice()
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
    .filter((post, index, all) => all.findIndex(candidate => candidate.id === post.id) === index)
    .slice(0, parseLatestPostsLimit(String(limit)));
}

export function createDemoLatestPosts(evidence: Evidence[], lastUpdatedAt: string, limit: number): LatestPostsResponse {
  const posts = evidence.map<LatestPost>(item => ({
    id: item.postId,
    text: item.excerpt,
    url: item.url,
    postedAt: item.postedAt,
    isRelevant: item.eventType !== "irrelevant",
    eventType: item.eventType,
    extractionConfidence: item.confidence,
    forecastImpact: item.effect,
    verified: item.verified,
    ambiguous: !item.verified || item.confidence < .75,
    metrics: { likes: 0, reposts: 0, replies: 0 },
  }));
  return { mode: "demo", lastUpdatedAt, posts: sortAndDedupePosts(posts, limit) };
}
