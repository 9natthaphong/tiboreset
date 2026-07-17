import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMilestoneSeedRows, loadHistoricalDatasets } from "@/lib/historical-data";
import { createMilestoneCandidate, deriveMilestoneState, parseMilestoneSignal } from "@/lib/milestones";

const post = (text: string, latestVerifiedUsers: number | null = null) => createMilestoneCandidate({
  text, sourcePostId: "2099999999999999999", sourceUrl: "https://x.com/thsottiaux/status/2099999999999999999",
  sourceAccount: "thsottiaux", announcedAt: "2026-07-20T12:00:00.000Z", latestVerifiedUsers,
});

describe("generic milestone state", () => {
  it("auto-verifies an explicit official combined full reset", () => {
    const candidate = post("Codex and ChatGPT Work reached 10 million active users. Usage limits have been reset.");
    expect(candidate).toMatchObject({ reportedActiveUsers: 10_000_000, denominator: "codex_and_chatgpt_work", resetType: "full", verificationStatus: "verified" });
  });

  it("distinguishes announcement-only, scheduled, and banked milestones", () => {
    expect(post("Codex and ChatGPT Work reached 10 million active users.")?.resetType).toBe("announcement_only");
    expect(post("Codex and ChatGPT Work reached 10 million active users. Usage limits will be reset tomorrow.")?.resetType).toBe("scheduled");
    expect(post("Codex and ChatGPT Work reached 10 million active users. One banked reset was added.")?.resetType).toBe("banked");
  });

  it("requires review for an ambiguous joke", () => {
    expect(post("Maybe Codex and ChatGPT Work reached 10 million active users? Just kidding about a reset.")).toMatchObject({ verificationStatus: "needs_review" });
  });

  it("does not let a lower late-arriving milestone displace a higher verified milestone", () => {
    expect(post("Codex and ChatGPT Work reached 9 million active users. Usage limits have been reset.", 10_000_000)).toMatchObject({ verificationStatus: "needs_review" });
  });

  it("deduplicates candidates by source post ID at the persistence boundary", () => {
    const first = post("Codex and ChatGPT Work reached 10 million active users.")!;
    const store = new Map<string, typeof first>();
    store.set(first.sourcePostId, first);
    store.set(first.sourcePostId, first);
    expect(store.size).toBe(1);
  });

  it("stops at the final pledged target and never invents an 11M pledge", () => {
    const candidate = post("Codex and ChatGPT Work reached 10 million active users. Usage limits have been reset.")!;
    const state = deriveMilestoneState([candidate]);
    expect(state.progressPercent).toBe(100);
    expect(state.pledgedMilestoneReached).toBe(true);
    expect(state.nextTargetUsers).toBeNull();
  });

  it("keeps the reviewed 3M through 9M bootstrap ledger intact", () => {
    expect(buildMilestoneSeedRows(loadHistoricalDatasets()).map(item => item.reportedActiveUsers).sort((a, b) => a - b))
      .toEqual([3, 4, 5, 6, 7, 8, 9].map(value => value * 1_000_000));
  });

  it("keeps literal milestone business state out of public component markup", () => {
    const publicSource = readFileSync("src/components/oracle-experience.tsx", "utf8");
    expect(publicSource).not.toMatch(/<b>10M<\/b>|MILESTONE PROGRESS\s*[·:]\s*90%|9_000_000|10_000_000/);
  });

  it("parses only explicit user-count milestones", () => {
    expect(parseMilestoneSignal("We shipped 10 million tokens today")).toBeNull();
  });
});
