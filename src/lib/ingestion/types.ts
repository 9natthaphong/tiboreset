import type { Extraction } from "@/lib/extraction/schema";
import type { Forecast, ForecastContext } from "@/lib/forecasting";
import type { SocialAccount, SocialPost } from "@/lib/social/adapters";
import type { MilestoneEvent } from "@/lib/milestones";
import type { ForecastSaveReason, StoredForecastSummary } from "@/lib/forecasting/current-refresh";
import type { IngestionFailureCategory } from "./errors";

export type StoredAccount = SocialAccount & { databaseId: string; latestProcessedPostId?: string };
export type StoredPost = { databaseId: string; platformPostId: string };
export type StoredExtraction = { databaseId: string };

export type ExtractionResult = {
  extraction: Extraction;
  extractionVersion: string;
  source: "openai" | "local_fallback" | "local";
  fallbackReason?: string;
};

export type IngestionReport = {
  runId: string;
  status: "success";
  source: "x";
  accountResolved: boolean;
  postsRead: number;
  postsInserted: number;
  postsAnalyzed: number;
  forecastRecalculated: true;
  forecastChanged: boolean;
  forecastSaveReason: ForecastSaveReason;
  forecastCalculatedAt: string;
  forecastModelVersion: string;
  forecastId: string | null;
  durationMs: number;
  completedAt: string;
  xResourcesConsumed: number;
};

export type IngestionFailureReport = {
  completedAt: string;
  durationMs: number;
  safeError: string;
  failureCategory: IngestionFailureCategory;
  postsRead: number;
  postsInserted: number;
  postsAnalyzed: number;
  xResourcesConsumed: number;
  forecastRecalculated: boolean;
  forecastChanged: boolean;
  forecastSaveReason: ForecastSaveReason | null;
  forecastCalculatedAt: string | null;
  forecastModelVersion: string | null;
  forecastId: string | null;
};

export interface IngestionRepository {
  startRun(input: { source: "x"; startedAt: string }): Promise<string>;
  completeRun(runId: string, report: IngestionReport): Promise<void>;
  failRun(runId: string, input: IngestionFailureReport): Promise<void>;
  findAccount(username: string): Promise<StoredAccount | null>;
  upsertAccount(account: SocialAccount): Promise<StoredAccount>;
  findExistingPostIds(platformPostIds: string[]): Promise<Set<string>>;
  insertPost(input: { account: StoredAccount; post: SocialPost; localScreen: Extraction }): Promise<StoredPost>;
  insertExtraction(input: { post: StoredPost; result: ExtractionResult; forecastImpact: number }): Promise<StoredExtraction>;
  getLatestVerifiedMilestoneUsers?(): Promise<number | null>;
  upsertMilestoneCandidate?(input: { candidate: MilestoneEvent; post: StoredPost }): Promise<void>;
  loadForecastEvidence(): Promise<import("@/lib/forecasting").Evidence[]>;
  loadForecastContext?(): Promise<ForecastContext>;
  getLatestForecast(): Promise<StoredForecastSummary | null>;
  saveForecast(forecast: Forecast): Promise<string>;
  updateLatestProcessedPostId(accountId: string, platformPostId: string, updatedAt: string): Promise<void>;
}
