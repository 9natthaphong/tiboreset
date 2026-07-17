import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { isAuthorizedLabMutation } from "@/lib/lab-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["verified", "rejected"]),
  rejectionReason: z.string().min(3).max(500).nullable().optional(),
}).strict();

const unauthorized = () => NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized" } }, { status: 401 });
const stableUuid = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const joined = hex.join(""); return `${joined.slice(0,8)}-${joined.slice(8,12)}-${joined.slice(12,16)}-${joined.slice(16,20)}-${joined.slice(20)}`;
};

export async function GET(request: Request) {
  if (!isAuthorizedLabMutation(request)) return unauthorized();
  const result = await getServiceSupabase().from("milestone_events").select("id,source_post_id,source_url,reported_active_users,denominator,reset_type,announced_at,verification_status,rejection_reason").order("announced_at", { ascending: false }).limit(50);
  if (result.error) return NextResponse.json({ error: { code: "unavailable", message: "Milestone review records unavailable" } }, { status: 503 });
  return NextResponse.json({ data: result.data ?? [] });
}

export async function POST(request: Request) {
  if (!isAuthorizedLabMutation(request)) return unauthorized();
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.status === "rejected" && !parsed.data.rejectionReason)) return NextResponse.json({ error: { code: "invalid_input", message: "Invalid review decision" } }, { status: 400 });
  const client = getServiceSupabase();
  const result = await client.from("milestone_events").update({ verification_status: parsed.data.status, verification_method: "manual_control_room_review", rejection_reason: parsed.data.status === "rejected" ? parsed.data.rejectionReason : null, updated_at: new Date().toISOString() }).eq("id", parsed.data.id).in("verification_status", ["extracted", "needs_review"]).select("id,source_post_id,reported_active_users,denominator,reset_type,announced_at,execution_at").maybeSingle();
  if (result.error) return NextResponse.json({ error: { code: "unavailable", message: "Milestone review could not be saved" } }, { status: 503 });
  if (!result.data) return NextResponse.json({ error: { code: "not_reviewable", message: "Candidate is not awaiting review" } }, { status: 409 });
  if (parsed.data.status === "verified" && result.data.reset_type !== "announcement_only") {
    const source = await client.from("source_posts").select("id").eq("platform", "x").eq("platform_post_id", result.data.source_post_id).maybeSingle();
    const reset = await client.from("known_reset_events").upsert({ id: stableUuid(`milestone:${result.data.source_post_id}`), occurred_at: result.data.execution_at ?? result.data.announced_at, reset_type: result.data.reset_type, reason_category: "user_milestone", description: `${Number(result.data.reported_active_users) / 1_000_000}M ${String(result.data.denominator).replaceAll("_", " ")} milestone: ${result.data.reset_type} reset announcement.`, source_post_id: source.data?.id ?? null, verified: true, verification_notes: `source_post_id=${result.data.source_post_id} | method=manual_control_room_review` }, { onConflict: "id" });
    if (source.error || reset.error) return NextResponse.json({ error: { code: "partial_failure", message: "Milestone verified but reset synchronization failed" } }, { status: 503 });
  }
  return NextResponse.json({ data: { id: result.data.id, status: parsed.data.status } });
}
