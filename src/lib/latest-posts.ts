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

export function mapPublicAccount(input: { username?: string | null; displayName?: string | null; profileImageUrl?: string | null }) {
  let profileImageUrl: string | null = null;
  if (input.profileImageUrl) {
    try {
      const url = new URL(input.profileImageUrl);
      if (url.protocol === "https:" && url.hostname === "pbs.twimg.com") profileImageUrl = url.toString();
    } catch { /* An invalid cached URL safely falls back to the neutral avatar. */ }
  }
  const cleanUsername = (input.username ?? "thsottiaux").replace(/^@/, "");
  return { username: `@${cleanUsername}`, displayName: input.displayName?.trim() || cleanUsername, profileImageUrl };
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
    verified: item.eventType !== "irrelevant" && item.verified,
    ambiguous: item.eventType !== "irrelevant" && (!item.verified || item.confidence < .75),
    needsReview: item.eventType !== "irrelevant" && (!item.verified || item.confidence < .75),
    wasAnalyzed: true,
    metrics: { likes: 0, reposts: 0, replies: 0 },
  }));
  return { mode: "demo", lastUpdatedAt, account: mapPublicAccount({ username: "thsottiaux", displayName: "Tibo" }), posts: sortAndDedupePosts(posts, limit) };
}
