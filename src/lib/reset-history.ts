import type { MilestoneEvent } from "@/lib/milestones";
import { deriveMilestoneState, formatMilestone } from "@/lib/milestones";
import type { PublicMilestoneState, ResetHistoryItem } from "@/lib/public-data-types";

function mergeHistoryItems(existing: ResetHistoryItem, incoming: ResetHistoryItem): ResetHistoryItem {
  const milestone = incoming.milestoneUsers ? incoming : existing.milestoneUsers ? existing : null;
  const live = incoming.historicalSource === "live" ? incoming : existing.historicalSource === "live" ? existing : null;

  return {
    ...existing,
    ...incoming,
    id: milestone?.id ?? live?.id ?? incoming.id,
    date: milestone?.date ?? incoming.date,
    type: milestone?.type ?? incoming.type,
    reason: milestone?.reason ?? incoming.reason,
    description: milestone?.description ?? incoming.description,
    sourceUrl: milestone?.sourceUrl ?? incoming.sourceUrl ?? existing.sourceUrl,
    included: existing.included || incoming.included,
    forecastBefore: incoming.forecastBefore ?? existing.forecastBefore,
    timeSincePreviousDays: milestone?.timeSincePreviousDays ?? incoming.timeSincePreviousDays ?? existing.timeSincePreviousDays,
    milestoneUsers: milestone?.milestoneUsers,
    displayDateThailand: milestone?.displayDateThailand ?? incoming.displayDateThailand ?? existing.displayDateThailand,
    verificationBadge: milestone?.verificationBadge ?? incoming.verificationBadge ?? existing.verificationBadge,
    sourceAccount: milestone?.sourceAccount ?? incoming.sourceAccount ?? existing.sourceAccount,
    verificationStatus: incoming.verificationStatus ?? existing.verificationStatus,
    historicalSource: live?.historicalSource ?? incoming.historicalSource ?? existing.historicalSource,
    sourcePostId: milestone?.sourcePostId ?? incoming.sourcePostId ?? existing.sourcePostId,
    denominator: milestone?.denominator ?? incoming.denominator ?? existing.denominator,
  };
}

export function mergeVerifiedResetHistory(
  primary: ResetHistoryItem[],
  seeded: ResetHistoryItem[],
): ResetHistoryItem[] {
  const bySource = new Map<string, ResetHistoryItem>();

  for (const item of [...seeded, ...primary]) {
    if (item.verificationStatus === "rejected") continue;
    const key = item.sourcePostId ?? item.id;
    const existing = bySource.get(key);
    bySource.set(key, existing ? mergeHistoryItems(existing, item) : item);
  }

  return [...bySource.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function publicMilestoneState(events: MilestoneEvent[]): PublicMilestoneState {
  const state = deriveMilestoneState(events);
  return {
    latestReportedUsers: state.latestReported?.reportedActiveUsers ?? null,
    latestVerifiedResetUsers: state.latestVerifiedReset?.reportedActiveUsers ?? null,
    latestResetType: state.latestReported?.resetType ?? null,
    latestEventDate: state.latestReported?.announcedAt ?? null,
    nextTargetUsers: state.nextTargetUsers,
    progressPercent: state.progressPercent,
    pledgedMilestoneReached: state.pledgedMilestoneReached,
    policyId: state.policy.policyId,
  };
}

export function milestoneHistoryDescription(event: Pick<MilestoneEvent, "reportedActiveUsers" | "denominator" | "resetType">): string {
  const denominator = event.denominator === "codex_and_chatgpt_work"
    ? "Codex and ChatGPT Work combined active-user"
    : event.denominator === "codex_only"
      ? "Codex-only active-user"
      : "active-user";
  const milestone = `${formatMilestone(event.reportedActiveUsers)} ${denominator} milestone.`;

  if (event.resetType === "scheduled") {
    return `${milestone} The official source announced a scheduled usage reset; completed execution is not claimed.`;
  }
  if (event.resetType === "banked") {
    return `${milestone} The official source announced a banked reset.`;
  }
  if (event.resetType === "full") {
    return `${milestone} The official source announced a full usage reset.`;
  }
  return milestone;
}
