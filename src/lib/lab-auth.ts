import { createHash, timingSafeEqual } from "node:crypto";

const bearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

export function timingSafeSecretMatch(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

export function isAuthorizedAdmin(request: Request, secret = process.env.ADMIN_SECRET) {
  return timingSafeSecretMatch(bearerToken(request), secret);
}

export function isControlRoomEnabled(value = process.env.CONTROL_ROOM_ENABLED) {
  return value === "true";
}

export function isAuthorizedLabMutation(
  request: Request,
  mode = process.env.NEXT_PUBLIC_APP_MODE,
  secret = process.env.ADMIN_SECRET,
  enabled = process.env.CONTROL_ROOM_ENABLED,
) {
  return isControlRoomEnabled(enabled) && (mode !== "live" || isAuthorizedAdmin(request, secret));
}

export function isAuthorizedInternalMutation(request: Request) {
  const supplied = bearerToken(request);
  return timingSafeSecretMatch(supplied, process.env.ADMIN_SECRET) || timingSafeSecretMatch(supplied, process.env.CRON_SECRET);
}
