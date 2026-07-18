import { getPublicSnapshot } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getPublicSnapshot();
  return Response.json(
    { ok: true, data: snapshot.forecast },
    { headers: { "Cache-Control": "no-store" } },
  );
}
