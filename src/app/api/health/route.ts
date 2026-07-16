import { getPublicHealth } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getPublicHealth(), { headers: { "Cache-Control": "no-store" } });
}
