import { injectConfirmedReset } from "@/lib/demo-store";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  return Response.json({ ok: true, data: injectConfirmedReset() });
}
