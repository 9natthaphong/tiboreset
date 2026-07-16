import { getPublicSnapshot } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getPublicSnapshot();
  return Response.json({ ok: true, data: snapshot.forecast }, { headers: { "Cache-Control": snapshot.forecast.mode === "live" ? "public, max-age=15, stale-while-revalidate=30" : "no-store" } });
}
