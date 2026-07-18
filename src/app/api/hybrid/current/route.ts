import { getPublicSnapshot } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getPublicSnapshot();
  return Response.json({
    ok: snapshot.hybridStatus === "available",
    status: snapshot.hybridStatus,
    cutoff: snapshot.canonicalCutoff,
    forecast: snapshot.forecast,
    hybrid: snapshot.hybrid,
    latestPosts: snapshot.latestPosts,
    evidence: snapshot.evidence,
    history: snapshot.history,
    resetHistory: snapshot.resetHistory,
  }, { headers: { "Cache-Control": "no-store" } });
}
