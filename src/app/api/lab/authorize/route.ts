import { isAuthorizedAdmin, isControlRoomEnabled } from "@/lib/lab-auth";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isControlRoomEnabled()) return apiError("NOT_FOUND", "Not found", 404);
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") return Response.json({ ok: true, data: { authorized: true, mode: "demo" } });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`lab-unlock:${ip}`, 10, 15 * 60_000)) return apiError("RATE_LIMITED", "Try again later", 429);
  if (!isAuthorizedAdmin(request)) return apiError("UNAUTHORIZED", "Administrative access required", 401);
  return Response.json({ ok: true, data: { authorized: true, mode: "live" } }, { headers: { "Cache-Control": "no-store" } });
}
