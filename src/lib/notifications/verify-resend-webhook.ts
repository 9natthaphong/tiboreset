import { getResendClient } from "./email-config";

export type ResendWebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyResendWebhook(payload: string, headers: ResendWebhookHeaders, webhookSecret = process.env.RESEND_WEBHOOK_SECRET) {
  if (!headers.id || !headers.timestamp || !headers.signature || !webhookSecret) return { ok: false as const, reason: "missing" as const };
  try {
    const event = getResendClient().webhooks.verify({
      payload,
      headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
      webhookSecret,
    });
    return { ok: true as const, event };
  } catch {
    return { ok: false as const, reason: "invalid" as const };
  }
}
