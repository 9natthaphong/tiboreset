import "server-only";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/server";

type DeliveryEventStatus = "delivered" | "bounced" | "complained";
type DeliveryEvent = {
  webhookId: string;
  type: `email.${DeliveryEventStatus}`;
  providerMessageId: string;
  occurredAt: string;
  bounce?: { type?: string; subType?: string };
};

export async function reserveResendWebhook(input: { id: string; type: string; occurredAt: string }) {
  if (!isServiceSupabaseConfigured()) throw new Error("Webhook persistence unavailable");
  const client = getServiceSupabase();
  const inserted = await client.from("resend_webhook_receipts").insert({ id: input.id, event_type: input.type, event_created_at: input.occurredAt, status: "processing" });
  if (!inserted.error) return "accepted" as const;
  if (inserted.error.code !== "23505") throw new Error("Unable to reserve webhook receipt");
  const existing = await client.from("resend_webhook_receipts").select("status").eq("id", input.id).maybeSingle();
  if (existing.error) throw new Error("Unable to inspect webhook receipt");
  if (existing.data?.status !== "failed") return "replay" as const;
  const retry = await client.from("resend_webhook_receipts").update({ status: "processing", error_code: null, received_at: new Date().toISOString() }).eq("id", input.id).eq("status", "failed");
  if (retry.error) throw new Error("Unable to retry webhook receipt");
  return "accepted" as const;
}

export async function markResendWebhookFailed(id: string) {
  if (!isServiceSupabaseConfigured()) return;
  await getServiceSupabase().from("resend_webhook_receipts").update({ status: "failed", error_code: "DELIVERY_UPDATE_FAILED" }).eq("id", id);
}

export async function applyResendDeliveryEvent(event: DeliveryEvent) {
  const client = getServiceSupabase();
  const deliveryResult = await client.from("email_deliveries").select("id,email_subscription_id,metadata").eq("provider", "resend").eq("provider_message_id", event.providerMessageId);
  if (deliveryResult.error) throw new Error("Unable to resolve email delivery");
  const deliveries = deliveryResult.data ?? [];
  for (const delivery of deliveries) {
    const metadata = delivery.metadata && typeof delivery.metadata === "object" ? delivery.metadata as Record<string, unknown> : {};
    const update = await client.from("email_deliveries").update({
      status: event.type.replace("email.", ""),
      delivered_at: event.type === "email.delivered" ? event.occurredAt : null,
      error_message: event.type === "email.bounced" ? "Provider reported a bounce; review before reactivation" : event.type === "email.complained" ? "Recipient complaint; future delivery suppressed" : null,
      metadata: { ...metadata, lastWebhookId: event.webhookId, providerEventType: event.type, providerOccurredAt: event.occurredAt, bounceType: event.bounce?.type ?? null, bounceSubtype: event.bounce?.subType ?? null },
    }).eq("id", delivery.id);
    if (update.error) throw new Error("Unable to update email delivery");
  }
  const subscriptionIds = [...new Set(deliveries.map(delivery => String(delivery.email_subscription_id)))];
  if (subscriptionIds.length && event.type === "email.complained") {
    const result = await client.from("email_subscriptions").update({ status: "complained", unsubscribed_at: event.occurredAt, updated_at: new Date().toISOString() }).in("id", subscriptionIds);
    if (result.error) throw new Error("Unable to suppress complained subscription");
  }
  if (subscriptionIds.length && event.type === "email.bounced") {
    const result = await client.from("email_subscriptions").update({ status: "bounced", updated_at: new Date().toISOString() }).in("id", subscriptionIds);
    if (result.error) throw new Error("Unable to mark bounced subscription");
  }
  const receipt = await client.from("resend_webhook_receipts").update({ status: "completed", processed_at: new Date().toISOString(), delivery_count: deliveries.length }).eq("id", event.webhookId);
  if (receipt.error) throw new Error("Unable to complete webhook receipt");
  return { status: event.type.replace("email.", "") as DeliveryEventStatus, deliveriesUpdated: deliveries.length };
}
