import { getForecastHistory } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const forecasts = await getForecastHistory();
  return Response.json({ ok: true, data: forecasts }, { headers: { "Cache-Control": forecasts.at(-1)?.mode === "live" ? "public, max-age=15, stale-while-revalidate=30" : "no-store" } });
}
