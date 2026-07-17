import { state } from "@/lib/demo-store";
import { forecastFromEvidence } from "@/lib/forecasting";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  const forecast = forecastFromEvidence(state().evidence, new Date().toISOString());
  state().forecasts.push(forecast);
  return Response.json({ ok: true, data: forecast });
}
