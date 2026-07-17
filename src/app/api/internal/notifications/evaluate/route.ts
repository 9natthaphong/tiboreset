import { evaluateNotifications } from "@/lib/demo-store";
import { isAuthorizedInternalMutation, isControlRoomEnabled } from "@/lib/lab-auth";
import { apiError } from "@/lib/validation";

export async function POST(request: Request) {
  const demoControl = process.env.NEXT_PUBLIC_APP_MODE !== "live" && isControlRoomEnabled();
  if (!demoControl && !isAuthorizedInternalMutation(request)) return apiError("UNAUTHORIZED", "Unauthorized", 401);
  return Response.json({ ok: true, data: evaluateNotifications() });
}
