import { ZodError } from "zod";
import { getLatestPosts, parseLatestPostsLimit } from "@/lib/public-data";
import { apiError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const limit = parseLatestPostsLimit(new URL(request.url).searchParams.get("limit"));
    const result = await getLatestPosts(limit);
    return Response.json(result, { headers: { "Cache-Control": result.mode === "live" ? "public, max-age=15, stale-while-revalidate=30" : "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) return apiError("INVALID_LIMIT", "limit must be an integer from 1 to 20", 400);
    return apiError("POSTS_UNAVAILABLE", "Latest posts are temporarily unavailable", 503);
  }
}
