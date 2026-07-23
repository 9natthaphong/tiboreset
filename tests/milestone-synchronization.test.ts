import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMilestoneSeedRows, historicalSeedResetHistory } from "@/lib/historical-data";
import { createMilestoneCandidate } from "@/lib/milestones";
import { mergeVerifiedResetHistory, milestoneHistoryDescription, publicMilestoneState } from "@/lib/reset-history";
import type { ResetHistoryItem } from "@/lib/public-data-types";

const POST_ID = "2079609157934886975";
const SOURCE_URL = `https://x.com/i/status/${POST_ID}`;
const ANNOUNCED_AT = "2026-07-21T16:47:15+00:00";
const POST_TEXT = "10M!\n\nNew day, new usage reset for paid users of Codex and ChatGPT Work. Lands in the next hour. Enjoy.";

const candidate = createMilestoneCandidate({
  text: POST_TEXT,
  sourcePostId: POST_ID,
  sourceUrl: SOURCE_URL,
  sourceAccount: "thsottiaux",
  announcedAt: ANNOUNCED_AT,
})!;

const milestoneHistoryItem: ResetHistoryItem = {
  id: "milestone-row",
  date: ANNOUNCED_AT,
  type: candidate.resetType,
  reason: "user_milestone",
  description: milestoneHistoryDescription(candidate),
  sourceUrl: SOURCE_URL,
  included: true,
  milestoneUsers: candidate.reportedActiveUsers,
  verificationBadge: "verified",
  sourceAccount: candidate.sourceAccount,
  verificationStatus: "verified",
  historicalSource: "live",
  sourcePostId: POST_ID,
  denominator: candidate.denominator,
};

const resolvedHistoryItem: ResetHistoryItem = {
  id: "resolved-row",
  date: ANNOUNCED_AT,
  type: "scheduled",
  reason: "official_scheduled_reset_announcement",
  description: "Official scheduled usage reset announcement; rollout timing was stated separately.",
  sourceUrl: SOURCE_URL,
  included: true,
  verificationBadge: "verified",
  sourceAccount: "@thsottiaux",
  verificationStatus: "verified",
  historicalSource: "live",
  sourcePostId: POST_ID,
};

describe("July 21 milestone synchronization", () => {
  it("normalizes the stored announcement as one verified 10M combined scheduled milestone", () => {
    expect(candidate).toMatchObject({
      sourcePostId: POST_ID,
      sourceUrl: SOURCE_URL,
      reportedActiveUsers: 10_000_000,
      denominator: "codex_and_chatgpt_work",
      resetType: "scheduled",
      announcedAt: ANNOUNCED_AT,
      executionAt: null,
      verificationStatus: "verified",
    });
  });

  it("merges resolved-event and milestone views by source identity without losing milestone metadata", () => {
    const merged = mergeVerifiedResetHistory(
      [resolvedHistoryItem, milestoneHistoryItem],
      historicalSeedResetHistory(),
    );
    const targetRows = merged.filter(item => item.sourcePostId === POST_ID);

    expect(targetRows).toHaveLength(1);
    expect(targetRows[0]).toMatchObject({
      id: "milestone-row",
      milestoneUsers: 10_000_000,
      denominator: "codex_and_chatgpt_work",
      type: "scheduled",
      sourceUrl: SOURCE_URL,
    });
    expect(merged.filter(item => !item.milestoneUsers && item.sourcePostId === POST_ID)).toHaveLength(0);
  });

  it("makes 10M the latest reported milestone and fulfills the pledged target", () => {
    const state = publicMilestoneState([...buildMilestoneSeedRows(), candidate]);

    expect(state).toMatchObject({
      latestReportedUsers: 10_000_000,
      latestVerifiedResetUsers: 9_000_000,
      latestResetType: "scheduled",
      latestEventDate: ANNOUNCED_AT,
      nextTargetUsers: null,
      progressPercent: 100,
      pledgedMilestoneReached: true,
    });
  });

  it("retains the reviewed 3M through 9M bootstrap records unchanged", () => {
    expect(buildMilestoneSeedRows().map(item => item.reportedActiveUsers).sort((a, b) => a - b))
      .toEqual([3, 4, 5, 6, 7, 8, 9].map(value => value * 1_000_000));
  });

  it("keeps public consumers synchronized on the canonical milestone state", () => {
    const api = readFileSync("src/app/api/hybrid/current/route.ts", "utf8");
    const page = readFileSync("src/components/oracle-experience.tsx", "utf8");
    const dataLab = readFileSync("src/app/lab/data/page.tsx", "utf8");

    expect(api).toContain("milestoneState: snapshot.milestoneState");
    expect(page).toContain("publicMilestoneState(events)");
    expect(page).toContain("currentMilestoneState.latestReportedUsers");
    expect(page).not.toContain("The July 9M figure");
    expect(dataLab).toContain('executionAt ?? "not verified"');
  });

  it("keeps the frozen Reset Oracle v2 artifacts byte-for-byte unchanged", () => {
    const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

    expect(hash("artifacts/backtests/2026-06-17_2026-07-17/v2/metrics.json"))
      .toBe("5c27ee2b5756bf5bfb5b1bff554edcc7dcc1d126a8c54307d1c45c0165bb4215");
    expect(hash("artifacts/backtests/2026-06-17_2026-07-17/v2/rolling-forecasts.json"))
      .toBe("ca19959f15afd6d9e6474909949b89fc41bf89046a789a96f24b65373121481c");
    expect(hash("src/lib/forecasting/v2/index.ts"))
      .toBe("affe86820c706a0f3678f7abc5a706575eebe7858ae060bc7ca2ab865ad4462a");
    expect(hash("src/lib/hybrid-likelihood/index.ts"))
      .toBe("91ed799ce295e2f6435d970fe41adbb6313a19dd1a9b9ed0b03e6bb8782bbb8d");
  });
});
