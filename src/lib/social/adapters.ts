export type SocialAccount = { id: string; username: string; displayName: string; profileImageUrl?: string };
export type SocialPost = { id: string; text: string; url: string; createdAt: string; raw: unknown };
export type SocialPostBatch = { posts: SocialPost[]; newestId?: string; raw: unknown };

export interface SocialSourceAdapter {
  resolveAccount(username: string): Promise<SocialAccount>;
  fetchPosts(input: { accountId: string; sinceId?: string; maxResults?: number }): Promise<SocialPostBatch>;
}

export class FixtureSourceAdapter implements SocialSourceAdapter {
  constructor(private posts: SocialPost[] = []) {}
  async resolveAccount(username: string) { return { id: "demo-tibo", username, displayName: "Demo monitored account" }; }
  async fetchPosts({ sinceId, maxResults = 10 }: { accountId: string; sinceId?: string; maxResults?: number }) {
    const posts = this.posts
      .filter(post => !sinceId || BigInt(post.id) > BigInt(sinceId))
      .sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)))
      .slice(0, maxResults);
    return { posts, newestId: posts[0]?.id, raw: { mode: "fixture" } };
  }
}

export class ManualImportSourceAdapter extends FixtureSourceAdapter {
  static fromText(text: string, url = "manual://post") {
    return new ManualImportSourceAdapter([{ id: String(Date.now()), text, url, createdAt: new Date().toISOString(), raw: { manual: true } }]);
  }
}

type FetchLike = typeof fetch;

export class XApiSourceAdapter implements SocialSourceAdapter {
  constructor(
    private token: string,
    private fetcher: FetchLike = fetch,
    private sleep: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    private random: () => number = Math.random,
  ) {}

  private async req(url: string) {
    const attempts = 4;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.token}` } });
      if (response.ok) return response.json();
      if (response.status !== 429 || attempt === attempts - 1) throw new Error(`X API request failed (${response.status})`);
      const resetSeconds = Number(response.headers.get("x-rate-limit-reset") ?? 0);
      const resetDelay = resetSeconds > 0 ? Math.max(0, resetSeconds * 1000 - Date.now()) : 0;
      const exponentialDelay = Math.min(30_000, 750 * 2 ** attempt);
      await this.sleep(Math.min(30_000, Math.max(resetDelay, exponentialDelay) + Math.floor(this.random() * 400)));
    }
    throw new Error("X API request failed");
  }

  async resolveAccount(username: string) {
    const result = await this.req(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,name`);
    return { id: result.data.id, username, displayName: result.data.name, profileImageUrl: result.data.profile_image_url };
  }

  async fetchPosts({ accountId, sinceId, maxResults = 10 }: { accountId: string; sinceId?: string; maxResults?: number }) {
    const boundedMax = Math.max(5, Math.min(10, Math.trunc(maxResults)));
    const query = new URLSearchParams({ max_results: String(boundedMax), "tweet.fields": "created_at,public_metrics" });
    if (sinceId) query.set("since_id", sinceId);
    const raw = await this.req(`https://api.x.com/2/users/${encodeURIComponent(accountId)}/tweets?${query}`);
    const posts = (raw.data ?? []).map((post: { id: string; text: string; created_at: string; public_metrics?: unknown }) => ({
      id: post.id,
      text: post.text,
      url: `https://x.com/i/status/${post.id}`,
      createdAt: post.created_at,
      raw: post,
    }));
    return { posts, newestId: posts[0]?.id, raw };
  }
}
