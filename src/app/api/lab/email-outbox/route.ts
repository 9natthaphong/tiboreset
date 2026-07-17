import { state } from "@/lib/demo-store";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  return Response.json({ ok: true, data: state().outbox }, { headers: { "Cache-Control": "no-store" } });
}
