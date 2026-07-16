import { describe, expect, it } from "vitest";
import type { Evidence } from "@/lib/forecasting";
import { createDemoLatestPosts, parseLatestPostsLimit, sortAndDedupePosts } from "@/lib/latest-posts";
import { getUsageGuidance } from "@/lib/usage-guidance";

const evidence: Evidence[] = [
  { id: "a", postId: "post-1", postedAt: "2026-07-15T12:00:00Z", excerpt: "Demo scenario: older signal", eventType: "capacity_signal", confidence: .7, verified: false, url: "#demo", effect: -3 },
  { id: "b", postId: "post-2", postedAt: "2026-07-16T12:00:00Z", excerpt: "Demo scenario: newer signal", eventType: "reset_hint", confidence: .87, verified: false, url: "#demo", effect: 8 },
  { id: "c", postId: "post-2", postedAt: "2026-07-16T12:00:00Z", excerpt: "Duplicate stored event", eventType: "reset_hint", confidence: .87, verified: false, url: "#demo", effect: 8 },
];

describe("latest public posts", () => {
  it("sorts newest first and removes duplicate platform post IDs", () => {
    const result = createDemoLatestPosts(evidence, "2026-07-16T12:00:00Z", 6);
    expect(result.mode).toBe("demo");
    expect(result.posts.map(post => post.id)).toEqual(["post-2", "post-1"]);
    expect(result.posts.every(post => post.text.toLowerCase().includes("demo") || post.id === "post-2")).toBe(true);
  });

  it("validates the public API limit", () => {
    expect(parseLatestPostsLimit(undefined)).toBe(6);
    expect(parseLatestPostsLimit("20")).toBe(20);
    expect(() => parseLatestPostsLimit("0")).toThrow();
    expect(() => parseLatestPostsLimit("21")).toThrow();
  });

  it("applies a requested limit after deduplication", () => {
    const posts = createDemoLatestPosts(evidence, "2026-07-16T12:00:00Z", 6).posts;
    expect(sortAndDedupePosts(posts, 1)).toHaveLength(1);
  });
});

describe("deterministic usage guidance", () => {
  it.each([
    [.29, "LOW"], [.3, "WATCH"], [.59, "WATCH"], [.6, "PLAUSIBLE"], [.79, "PLAUSIBLE"], [.8, "STRONG"], [.97, "STRONG"],
  ] as const)("maps %s to %s", (probability, band) => expect(getUsageGuidance(probability).band).toBe(band));

  it("uses the confirmed guidance only for confirmed resets", () => {
    expect(getUsageGuidance(.65, true).band).toBe("CONFIRMED");
    expect(getUsageGuidance(.65, false).band).toBe("PLAUSIBLE");
  });
});
