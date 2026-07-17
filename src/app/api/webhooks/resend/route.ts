import { z } from "zod";
import { getEmailConfigurationStatus } from "@/lib/notifications/email-config";
import { applyResendDeliveryEvent, markResendWebhookFailed, reserveResendWebhook } from "@/lib/notifications/resend-webhook-repository";
import { verifyResendWebhook } from "@/lib/notifications/verify-resend-webhook";
import { apiError } from "@/lib/validation";

const handledEventSchema = z.object({
  type: z.enum(["email.delivered", "email.bounced", "email.complained"]),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({
    email_id: z.string().min(1),
    bounce: z.object({ type: z.string().optional(), subType: z.string().optional() }).optional(),
  }).passthrough(),
}).passthrough();

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (getEmailConfigurationStatus() !== "configured") return apiError("EMAIL_CONFIGURATION_ERROR", "Email webhook is unavailable", 503);
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  const payload = await request.text();
  const verified = verifyResendWebhook(payload, { id, timestamp, signature });
  if (!verified.ok) return apiError("INVALID_SIGNATURE", verified.reason === "missing" ? "Invalid webhook signature" : "Invalid or expired webhook signature", 401);
  const webhookId = id!;
  const parsed = handledEventSchema.safeParse(verified.event);
  if (!parsed.success) return Response.json({ ok: true, data: { ignored: true } });
  let reserved: "accepted" | "replay";
  try {
    reserved = await reserveResendWebhook({ id: webhookId, type: parsed.data.type, occurredAt: parsed.data.created_at });
  } catch {
    return apiError("WEBHOOK_PERSISTENCE_UNAVAILABLE", "Webhook persistence is unavailable", 503);
  }
  if (reserved === "replay") return apiError("WEBHOOK_REPLAY", "Webhook has already been processed", 400);
  try {
    const result = await applyResendDeliveryEvent({ webhookId, type: parsed.data.type, providerMessageId: parsed.data.data.email_id, occurredAt: parsed.data.created_at, bounce: parsed.data.data.bounce });
    return Response.json({ ok: true, data: result });
  } catch {
    await markResendWebhookFailed(webhookId);
    return apiError("WEBHOOK_PROCESSING_FAILED", "Webhook could not be processed", 503);
  }
}
