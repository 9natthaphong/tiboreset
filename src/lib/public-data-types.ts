import type { EventType, Evidence, Forecast } from "@/lib/forecasting";

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
  metrics: { likes: number; reposts: number; replies: number };
};

export type LatestPostsResponse = {
  mode: PublicMode;
  lastUpdatedAt: string;
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
  lastIngestionAt: string | null;
  lastForecastAt: string | null;
};

export type PublicSnapshot = {
  forecast: Forecast;
  history: HistoryPoint[];
  evidence: Evidence[];
  latestPosts: LatestPostsResponse;
  resetHistory: ResetHistoryItem[];
  historicalDataset: HistoricalDatasetSummary;
  health: PublicHealth;
};
