import { runConfiguredIngestion } from "@/lib/ingestion/configured";
import { isAuthorizedCron } from "@/lib/ingestion/auth";
import { apiError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) return apiError("CRON_NOT_CONFIGURED", "Cron ingestion is unavailable", 503);
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) return apiError("UNAUTHORIZED", "Unauthorized", 401);
  try {
    const report = await runConfiguredIngestion();
    return Response.json({ ok: true, data: report }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("INGESTION_FAILED", "Ingestion failed; a safe audit record was stored", 502);
  }
}
