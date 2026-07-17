import { z } from "zod";
import policyJson from "@/data/milestone-target-policy.json";

export const milestoneDenominatorSchema = z.enum(["codex_only", "codex_and_chatgpt_work", "unknown"]);
export const milestoneResetTypeSchema = z.enum(["full", "banked", "scheduled", "announcement_only"]);
export const milestoneVerificationStatusSchema = z.enum(["extracted", "needs_review", "verified", "rejected"]);

export const milestoneEventSchema = z.object({
  id: z.string().optional(),
  sourcePostId: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceAccount: z.string().min(1),
  reportedActiveUsers: z.number().int().positive(),
  denominator: milestoneDenominatorSchema,
  resetType: milestoneResetTypeSchema,
  announcedAt: z.string().datetime({ offset: true }),
  executionAt: z.string().datetime({ offset: true }).nullable().default(null),
  verificationStatus: milestoneVerificationStatusSchema,
  verificationMethod: z.string().min(1),
  rejectionReason: z.string().nullable().default(null),
}).strict();

export const milestoneTargetPolicySchema = z.object({
  policyId: z.string().min(1), version: z.string().min(1), stepUsers: z.number().int().positive(),
  finalPledgedTargetUsers: z.number().int().positive(), status: z.enum(["active", "superseded", "expired"]),
}).strict();

export type MilestoneEvent = z.infer<typeof milestoneEventSchema>;
export type MilestoneDenominator = z.infer<typeof milestoneDenominatorSchema>;
export type MilestoneResetType = z.infer<typeof milestoneResetTypeSchema>;
export const MILESTONE_TARGET_POLICY = milestoneTargetPolicySchema.parse(policyJson);

const countPattern = /\b(\d+(?:\.\d+)?)\s*(m|million)\b/i;
const ambiguousPattern = /\b(joke|joking|kidding|maybe|rumou?r|imagine|wish|if only)\b|\?|\bshould we\b/i;

export type ParsedMilestoneSignal = Pick<MilestoneEvent, "reportedActiveUsers" | "denominator" | "resetType"> & { ambiguous: boolean };

export function parseMilestoneSignal(text: string): ParsedMilestoneSignal | null {
  const match = text.match(countPattern);
  if (!match) return null;
  const lower = text.toLowerCase();
  if (!/\b(user|users|active)\b/.test(lower)) return null;
  const reportedActiveUsers = Math.round(Number(match[1]) * 1_000_000);
  const hasCodex = /\bcodex\b/.test(lower);
  const hasWork = /chatgpt\s+work/.test(lower);
  const denominator: MilestoneDenominator = hasCodex && hasWork ? "codex_and_chatgpt_work" : hasCodex ? "codex_only" : "unknown";
  let resetType: MilestoneResetType = "announcement_only";
  if (/\bbanked\s+reset\b|\breset\s+(?:was\s+)?(?:added|banked)\b/.test(lower)) resetType = "banked";
  else if (/\b(?:will|would|scheduled to|going to)\s+(?:be\s+)?reset\b|\breset\s+(?:tomorrow|later|next|in\s+the\s+following)\b/.test(lower)) resetType = "scheduled";
  else if (/\b(?:usage\s+)?limits?\s+(?:have\s+been|were|are now)\s+reset\b|\b(?:usage|quota)\s+(?:has\s+been|was)\s+reset\b|\breset\s+(?:is\s+)?confirmed\b/.test(lower)) resetType = "full";
  return { reportedActiveUsers, denominator, resetType, ambiguous: ambiguousPattern.test(text) };
}

export function createMilestoneCandidate(input: {
  text: string; sourcePostId: string; sourceUrl: string; sourceAccount: string; announcedAt: string;
  latestVerifiedUsers?: number | null;
}): MilestoneEvent | null {
  const parsed = parseMilestoneSignal(input.text);
  if (!parsed) return null;
  const officialAccount = input.sourceAccount.replace(/^@/, "").toLowerCase() === "thsottiaux";
  const lowerThanVerified = Boolean(input.latestVerifiedUsers && parsed.reportedActiveUsers < input.latestVerifiedUsers);
  const canVerify = officialAccount && !parsed.ambiguous && !lowerThanVerified && parsed.denominator !== "unknown";
  return milestoneEventSchema.parse({
    sourcePostId: input.sourcePostId, sourceUrl: input.sourceUrl, sourceAccount: input.sourceAccount,
    reportedActiveUsers: parsed.reportedActiveUsers, denominator: parsed.denominator, resetType: parsed.resetType,
    announcedAt: input.announcedAt, executionAt: parsed.resetType === "full" || parsed.resetType === "banked" ? input.announcedAt : null,
    verificationStatus: canVerify ? "verified" : "needs_review",
    verificationMethod: canVerify ? "deterministic_official_post_v1" : "deterministic_candidate_v1",
    rejectionReason: !officialAccount ? "Source account is not the configured official Tibo account." : parsed.ambiguous ? "Ambiguous or playful wording requires review." : lowerThanVerified ? "Lower than the current verified milestone; review required." : parsed.denominator === "unknown" ? "Milestone denominator is unknown." : null,
  });
}

export function deriveMilestoneState(events: MilestoneEvent[]) {
  const verifiedCombined = events.filter(event => event.verificationStatus === "verified" && event.denominator === "codex_and_chatgpt_work");
  const latestReported = verifiedCombined.sort((a, b) => b.reportedActiveUsers - a.reportedActiveUsers || Date.parse(b.announcedAt) - Date.parse(a.announcedAt))[0] ?? null;
  const latestVerifiedReset = verifiedCombined.filter(event => event.resetType === "full" || event.resetType === "banked")
    .sort((a, b) => b.reportedActiveUsers - a.reportedActiveUsers || Date.parse(b.announcedAt) - Date.parse(a.announcedAt))[0] ?? null;
  const reached = Boolean(latestReported && latestReported.reportedActiveUsers >= MILESTONE_TARGET_POLICY.finalPledgedTargetUsers);
  const nextTargetUsers = reached ? null : MILESTONE_TARGET_POLICY.finalPledgedTargetUsers;
  const progressPercent = latestReported ? Math.min(100, Math.round(latestReported.reportedActiveUsers / MILESTONE_TARGET_POLICY.finalPledgedTargetUsers * 100)) : null;
  return { latestReported, latestVerifiedReset, nextTargetUsers, progressPercent, pledgedMilestoneReached: reached, policy: MILESTONE_TARGET_POLICY };
}

export function formatMilestone(users: number | null | undefined) {
  return users ? `${users / 1_000_000}M` : "Not available";
}
