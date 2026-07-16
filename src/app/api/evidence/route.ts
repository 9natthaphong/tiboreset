import { getPublicEvidence } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const evidence = await getPublicEvidence();
  return Response.json({ ok: true, data: evidence }, { headers: { "Cache-Control": "no-store" } });
}
