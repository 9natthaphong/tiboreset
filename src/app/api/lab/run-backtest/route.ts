import { state } from "@/lib/demo-store";
import { backtest } from "@/lib/forecasting";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  return Response.json({ ok: true, data: backtest({ cutoff: "2026-07-11T12:00:00Z", horizonHours: 36, evidence: state().evidence, resets: [{ occurredAt: "2026-07-13T00:00:00Z" }] }) });
}
