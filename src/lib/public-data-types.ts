import type { EventType, Evidence, Forecast } from "@/lib/forecasting";
import type { ExternalContextEvent } from "@/lib/external-context";
import type { HybridLikelihood, StructuredSignalType } from "@/lib/hybrid-likelihood";

export type PublicMode = "demo" | "live";

export type LatestPost = {
  id: string;
  text: string;
  url: string;
  postedAt: string;
  isRelevant: boolean;
  eventType: EventType;
  extractionConfidence: number;
  forecastImpact: number;
  verified: boolean;
  ambiguous: boolean;
  needsReview: boolean;
  wasAnalyzed: boolean;
  metrics: { likes: number; reposts: number; replies: number };
  signalType?: StructuredSignalType;
  hybridContributionPoints?: number;
  probabilityCounterfactualDeltaPercentagePoints?: number | null;
  signalBucket?: "forecast_moving" | "screened_out";
  signalReason?: string;
  recencyFactor?: number;
  exclusionReason?: string | null;
  resetType?: "full" | "banked" | null;
  resolvedAt?: string | null;
  cycleStatus?: "active_cycle" | "previous_cycle_resolved" | "historical";
};

export type LatestPostsResponse = {
  mode: PublicMode;
  lastUpdatedAt: string;
  account: { username: string; displayName: string; profileImageUrl: string | null };
  posts: LatestPost[];
};

export type HistoryPoint = {
  forecastId: string;
  time: string;
  probability: number;
  low: number;
  high: number;
  label: string;
  excerpt?: string;
  eventType?: EventType;
  evidencePostId?: string;
  verified?: boolean;
  impact?: number;
  cyclePhase?: "previous" | "active";
  resolvedResetAt?: string;
  resolvedResetSource?: string;
  resolvedResetType?: "full" | "banked";
};

export type ResetHistoryItem = {
  id: string;
  date: string;
  type: string;
  reason: string;
  description: string;
  sourceUrl?: string;
  included: boolean;
  forecastBefore?: number;
  timeSincePreviousDays?: number;
  milestoneUsers?: number;
  displayDateThailand?: string;
  verificationBadge?: "official_announcement" | "verified";
  sourceAccount?: string;
  verificationStatus?: "verified" | "unverified" | "rejected";
  historicalSource?: "seed" | "live" | "demo";
  sourcePostId?: string;
  denominator?: "codex_only" | "codex_and_chatgpt_work" | "unknown";
};

export type PublicMilestoneState = {
  latestReportedUsers: number | null;
  latestVerifiedResetUsers: number | null;
  latestResetType: "full" | "banked" | "scheduled" | "announcement_only" | null;
  latestEventDate: string | null;
  nextTargetUsers: number | null;
  progressPercent: number | null;
  pledgedMilestoneReached: boolean;
  policyId: string;
};

export type HistoricalDatasetSummary = {
  datasetVersion: string;
  confirmedResets: number;
  milestoneResets: number;
  latestMilestoneUsers: number | null;
  latestMilestoneLabel: string | null;
  negativeWindows: number;
  positiveWindows: number;
  verifiedSources: number;
  totalSources: number;
  recordsAvailable: boolean;
};

export type PublicHealth = {
  app: "ok";
  mode: PublicMode;
  database: "connected" | "unavailable";
  xSource: "configured" | "unavailable";
  openAI: "configured" | "unavailable";
  email: "disabled" | "configured" | "configuration_error";
  lastIngestionAt: string | null;
  lastForecastAt: string | null;
  lastForecastCalculatedAt: string | null;
  lastForecastSavedAt: string | null;
  currentModelVersion: string | null;
  forecastFreshness: "FRESH" | "STALE";
  latestRun: { postsRead: number; newPostsScreened: number; relevantPostsAnalyzed: number; forecastRecalculated: boolean; forecastChanged: boolean; forecastSaveReason: string | null } | null;
};

export type PublicSnapshot = {
  forecast: Forecast;
  history: HistoryPoint[];
  evidence: Evidence[];
  latestPosts: LatestPostsResponse;
  resetHistory: ResetHistoryItem[];
  milestoneState: PublicMilestoneState;
  historicalDataset: HistoricalDatasetSummary;
  externalContextEvents: ExternalContextEvent[];
  health: PublicHealth;
  hybrid: HybridLikelihood | null;
  hybridStatus: "available" | "unavailable";
  canonicalCutoff: string | null;
};
