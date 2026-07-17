import { afterEach, describe, expect, it } from "vitest";
import { POST as authorize } from "@/app/api/lab/authorize/route";
import { POST as injectDemoEvent } from "@/app/api/lab/demo-event/route";
import { isAuthorizedAdmin, isAuthorizedLabMutation, timingSafeSecretMatch } from "@/lib/lab-auth";

const request = (token?: string) => new Request("http://localhost/api/lab/action", { headers: token ? { Authorization: `Bearer ${token}` } : undefined });

describe("Lab authorization", () => {
  const originalMode = process.env.NEXT_PUBLIC_APP_MODE;
  const originalSecret = process.env.ADMIN_SECRET;
  const originalControlRoom = process.env.CONTROL_ROOM_ENABLED;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.NEXT_PUBLIC_APP_MODE; else process.env.NEXT_PUBLIC_APP_MODE = originalMode;
    if (originalSecret === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = originalSecret;
    if (originalControlRoom === undefined) delete process.env.CONTROL_ROOM_ENABLED; else process.env.CONTROL_ROOM_ENABLED = originalControlRoom;
  });

  it("uses a timing-safe digest comparison", () => {
    expect(timingSafeSecretMatch("correct", "correct")).toBe(true);
    expect(timingSafeSecretMatch("wrong", "correct")).toBe(false);
    expect(timingSafeSecretMatch(null, "correct")).toBe(false);
  });

  it("rejects missing and incorrect authorization in Live Mode", () => {
    expect(isAuthorizedLabMutation(request(), "live", "correct", "true")).toBe(false);
    expect(isAuthorizedLabMutation(request("wrong"), "live", "correct", "true")).toBe(false);
    expect(isAuthorizedAdmin(request("wrong"), "correct")).toBe(false);
  });

  it("accepts a correct bearer secret in Live Mode", () => {
    expect(isAuthorizedLabMutation(request("correct"), "live", "correct", "true")).toBe(true);
  });

  it("preserves no-secret Demo Mode mutations", () => {
    expect(isAuthorizedLabMutation(request(), "demo", undefined, "true")).toBe(true);
  });

  it("disables all Lab mutations when the Control Room flag is not exactly true", () => {
    expect(isAuthorizedLabMutation(request("correct"), "live", "correct", "false")).toBe(false);
    expect(isAuthorizedLabMutation(request(), "demo", undefined, "TRUE")).toBe(false);
  });

  it("does not reveal the unlock endpoint when the Control Room is disabled", async () => {
    process.env.CONTROL_ROOM_ENABLED = "false";
    expect((await authorize(request("correct"))).status).toBe(404);
  });

  it("returns 401 from Live unlock and mutation routes for invalid authorization", async () => {
    process.env.NEXT_PUBLIC_APP_MODE = "live";
    process.env.ADMIN_SECRET = "correct";
    process.env.CONTROL_ROOM_ENABLED = "true";
    expect((await authorize(request("wrong"))).status).toBe(401);
    expect((await injectDemoEvent(request())).status).toBe(401);
  });
});
