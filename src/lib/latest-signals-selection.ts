export function selectCanonicalLatestSignals<T extends { platform_post_id: string; posted_at: string }>(input: {
  posts: T[];
  activePostIds: string[];
  policySourcePostId?: string | null;
  resolvedPostId?: string | null;
  limit: number;
}): T[] {
  const importantIds = new Set([...input.activePostIds, ...(input.policySourcePostId ? [input.policySourcePostId] : []), ...(input.resolvedPostId ? [input.resolvedPostId] : [])]);
  const important = input.posts.filter(post => importantIds.has(post.platform_post_id));
  const selectedIds = new Set(important.map(post => post.platform_post_id));
  return [...important, ...input.posts.filter(post => !selectedIds.has(post.platform_post_id))]
    .slice(0, Math.max(input.limit, important.length))
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at));
}
