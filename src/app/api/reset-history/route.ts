import { getResetHistory } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, data: await getResetHistory() }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
}
