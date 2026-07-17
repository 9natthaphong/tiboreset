import { runConfiguredIngestion } from "@/lib/ingestion/configured";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") return apiError("LIVE_MODE_REQUIRED", "X ingestion is available only in Live Mode", 409);
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  try {
    return Response.json({ ok: true, data: await runConfiguredIngestion() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("INGESTION_FAILED", "Ingestion failed; see the safe ingestion audit record", 502);
  }
}
