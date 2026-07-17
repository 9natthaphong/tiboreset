import { beforeEach, describe, expect, it, vi } from "vitest";
import { localExtract } from "@/lib/extraction/local";
import type { Extraction } from "@/lib/extraction/schema";
import { isAuthorizedCron } from "@/lib/ingestion/auth";
import { deterministicForecastImpact, MAX_X_POSTS_PER_RUN, runIngestion, type ExtractionResult, type IngestionReport, type IngestionRepository, type StoredAccount, type StoredExtraction, type StoredPost } from "@/lib/ingestion";
import type { Evidence, Forecast } from "@/lib/forecasting";
import type { SocialAccount, SocialPost, SocialSourceAdapter } from "@/lib/social/adapters";

class MemoryRepository implements IngestionRepository {
  account: StoredAccount | null = null;
  posts = new Map<string, { stored: StoredPost; post: SocialPost; screen: Extraction }>();
  extractions: Array<{ post: StoredPost; result: ExtractionResult; forecastImpact: number }> = [];
  forecasts: Forecast[] = [];
  completed: IngestionReport[] = [];
  failures: string[] = [];
  async startRun() { return `run-${this.completed.length + this.failures.length + 1}`; }
  async completeRun(_id: string, report: IngestionReport) { this.completed.push(report); }
  async failRun(_id: string, input: { safeError: string }) { this.failures.push(input.safeError); }
  async findAccount() { return this.account; }
  async upsertAccount(account: SocialAccount) { this.account = { ...account, databaseId: "00000000-0000-4000-8000-000000000001" }; return this.account; }
  async findExistingPostIds(ids: string[]) { return new Set(ids.filter(id => this.posts.has(id))); }
  async insertPost(input: { account: StoredAccount; post: SocialPost; localScreen: Extraction }) { const stored = { databaseId: `db-${input.post.id}`, platformPostId: input.post.id }; this.posts.set(input.post.id, { stored, post: input.post, screen: input.localScreen }); return stored; }
  async insertExtraction(input: { post: StoredPost; result: ExtractionResult; forecastImpact: number }): Promise<StoredExtraction> { this.extractions.push(input); return { databaseId: `event-${input.post.platformPostId}` }; }
  async loadForecastEvidence(): Promise<Evidence[]> { return this.extractions.filter(item => item.result.extraction.is_relevant && !item.result.extraction.requires_review).map(item => ({ id: `event-${item.post.platformPostId}`, postId: item.post.databaseId, postedAt: this.posts.get(item.post.platformPostId)!.post.createdAt, excerpt: this.posts.get(item.post.platformPostId)!.post.text, eventType: item.result.extraction.event_type, confidence: item.result.extraction.extraction_confidence, verified: true, url: "https://x.com/i/status/test", effect: item.forecastImpact })); }
  async saveForecast(forecast: Forecast) { this.forecasts.push(forecast); return `forecast-${this.forecasts.length}`; }
  async updateLatestProcessedPostId(_accountId: string, platformPostId: string) { if (this.account) this.account.latestProcessedPostId = platformPostId; }
}

class MemorySource implements SocialSourceAdapter {
  calls: Array<{ accountId: string; sinceId?: string; maxResults?: number }> = [];
  resolves = 0;
  constructor(public posts: SocialPost[]) {}
  async resolveAccount(username: string) { this.resolves += 1; return { id: "x-account", username, displayName: "Tibo" }; }
  async fetchPosts(input: { accountId: string; sinceId?: string; maxResults?: number }) { this.calls.push(input); const posts = this.posts.filter(post => !input.sinceId || BigInt(post.id) > BigInt(input.sinceId)).slice(0, input.maxResults); return { posts, newestId: posts[0]?.id, raw: {} }; }
}

const post = (id: string, text: string): SocialPost => ({ id, text, url: `https://x.com/i/status/${id}`, createdAt: "2026-07-16T10:00:00Z", raw: { id, text, public_metrics: { like_count: 1 } } });
const localResult = async (_text: string, screen: Extraction): Promise<ExtractionResult> => ({ extraction: screen, extractionVersion: "test-local", source: "local" });

describe("cron authorization", () => {
  it("rejects an invalid or missing cron secret", () => {
    expect(isAuthorizedCron("Bearer wrong", "correct")).toBe(false);
    expect(isAuthorizedCron(null, "correct")).toBe(false);
    expect(isAuthorizedCron("Bearer correct", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer correct", "correct")).toBe(true);
  });
});

describe("bounded live ingestion", () => {
  let repository: MemoryRepository;
  beforeEach(() => { repository = new MemoryRepository(); });

  it("caps the initial fetch at 10 and resolves the account only once", async () => {
    const source = new MemorySource(Array.from({ length: 12 }, (_, index) => post(String(200 - index), "ordinary status")));
    const report = await runIngestion({ repository, source, username: "thsottiaux", localExtract, extractRelevant: localResult });
    expect(source.calls[0]).toMatchObject({ maxResults: MAX_X_POSTS_PER_RUN, sinceId: undefined });
    expect(report.postsRead).toBe(10);
    expect(report.postsInserted).toBe(10);
    expect(source.resolves).toBe(1);
  });

  it("uses since_id after the first successful run", async () => {
    repository.account = { databaseId: "account-db", id: "x-account", username: "thsottiaux", displayName: "Tibo", latestProcessedPostId: "100" };
    const source = new MemorySource([post("102", "reset soon"), post("101", "ordinary")]);
    await runIngestion({ repository, source, username: "thsottiaux", localExtract, extractRelevant: localResult });
    expect(source.calls[0].sinceId).toBe("100");
    expect(source.resolves).toBe(0);
    expect(repository.account.latestProcessedPostId).toBe("102");
  });

  it("deduplicates platform post IDs before insertion", async () => {
    const source = new MemorySource([post("110", "reset soon"), post("110", "reset soon")]);
    const report = await runIngestion({ repository, source, username: "thsottiaux", localExtract, extractRelevant: localResult });
    expect(report.postsInserted).toBe(1);
    expect(repository.posts.size).toBe(1);
  });

  it("stores the local fallback when remote extraction fails", async () => {
    const source = new MemorySource([post("120", "reset soon")]);
    const fallback = vi.fn(async (_text: string, screen: Extraction): Promise<ExtractionResult> => ({ extraction: screen, extractionVersion: "test-fallback", source: "local_fallback", fallbackReason: "OpenAI extraction failed" }));
    await runIngestion({ repository, source, username: "thsottiaux", localExtract, extractRelevant: fallback });
    expect(repository.extractions[0].result.source).toBe("local_fallback");
    expect(repository.extractions[0].result.fallbackReason).toBe("OpenAI extraction failed");
  });

  it("does not analyze an unchanged post twice", async () => {
    const source = new MemorySource([post("130", "reset soon")]);
    const extractor = vi.fn(localResult);
    await runIngestion({ repository, source, username: "thsottiaux", localExtract, extractRelevant: extractor });
    source.posts = [post("130", "reset soon")];
    await runIngestion({ repository, source, username: "thsottiaux", localExtract, extractRelevant: extractor });
    expect(extractor).toHaveBeenCalledTimes(1);
    expect(repository.extractions).toHaveLength(1);
  });

  it("creates a forecast only when relevant evidence changes", async () => {
    await runIngestion({ repository, source: new MemorySource([post("140", "ordinary lunch update")]), username: "thsottiaux", localExtract, extractRelevant: localResult });
    expect(repository.forecasts).toHaveLength(0);
    repository.account!.latestProcessedPostId = "140";
    await runIngestion({ repository, source: new MemorySource([post("141", "We will reset usage limits tomorrow")]), username: "thsottiaux", localExtract, extractRelevant: localResult });
    expect(repository.forecasts).toHaveLength(1);
  });

  it("stores ambiguous reset language for review without changing the forecast", async () => {
    const report = await runIngestion({ repository, source: new MemorySource([post("142", "I actually stole their reset button. Youre welcome Codex.")]), username: "thsottiaux", localExtract, extractRelevant: localResult });
    expect(repository.extractions[0].result.extraction.requires_review).toBe(true);
    expect(repository.extractions[0].forecastImpact).toBe(0);
    expect(report.forecastChanged).toBe(false);
    expect(repository.forecasts).toHaveLength(0);
  });
});

describe("reset wording safety", () => {
  it.each([
    "I actually stole their reset button. Youre welcome Codex.",
    "Will you reset the limits?",
    "Maybe another reset soon",
  ])("keeps ambiguous wording as context only: %s", text => {
    const extraction = localExtract(text);
    expect(extraction.requires_review).toBe(true);
    expect(deterministicForecastImpact(extraction)).toBe(0);
  });

  it("allows a credible operational commitment", () => {
    const extraction = localExtract("We will reset usage limits tomorrow");
    expect(extraction.event_type).toBe("reset_hint");
    expect(extraction.requires_review).toBe(false);
    expect(deterministicForecastImpact(extraction)).toBe(8);
  });

  it("preserves an explicit confirmed reset impact", () => {
    const extraction = localExtract("Usage limits have been reset.");
    expect(extraction.event_type).toBe("explicit_reset_confirmation");
    expect(extraction.reset_confirmed).toBe(true);
    expect(deterministicForecastImpact(extraction)).toBe(35);
  });
});
