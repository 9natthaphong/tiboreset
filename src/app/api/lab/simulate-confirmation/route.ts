import { confirm, state } from "@/lib/demo-store";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isAuthorizedLabMutation(request)) return apiError("UNAUTHORIZED", "Admin authorization required", 401);
  const subscription = state().subscriptions.find(item => item.status === "pending");
  return Response.json({ ok: Boolean(subscription), data: subscription?.rawConfirmationToken && confirm(subscription.rawConfirmationToken) });
}
