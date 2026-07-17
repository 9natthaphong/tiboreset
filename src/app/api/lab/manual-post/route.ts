import { localExtract } from "@/lib/extraction/local";
import { forecastFromEvidence } from "@/lib/forecasting";
import { currentForecast, state } from "@/lib/demo-store";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError, manualPostInput } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  const parsed = manualPostInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", "Invalid manual post");
  const extraction = localExtract(parsed.data.text);
  const evidence = { id: crypto.randomUUID(), postId: `manual-${Date.now()}`, postedAt: new Date().toISOString(), excerpt: parsed.data.text, eventType: extraction.event_type, confidence: extraction.extraction_confidence, verified: false, url: parsed.data.url ?? "manual://post", effect: 0, commitmentStrength: extraction.commitment_strength, milestoneCurrent: extraction.milestone_current, milestoneTarget: extraction.milestone_target };
  state().evidence.push(evidence);
  if (extraction.is_relevant) state().forecasts.push(forecastFromEvidence(state().evidence, new Date().toISOString()));
  return Response.json({ ok: true, data: { extraction, forecast: currentForecast() } });
}
