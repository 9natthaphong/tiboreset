import { getEmailConfigurationStatus, getResendClient } from "./email-config";

export const emailMode = () => getEmailConfigurationStatus() === "configured" ? "resend" : "demo_outbox";

export async function sendLiveEmail(input: { to: string; subject: string; html: string; idempotencyKey: string }) {
  if (emailMode() !== "resend") return { mode: "demo_outbox" as const };
  const result = await getResendClient().emails.send({
    from: process.env.EMAIL_FROM!,
    to: input.to,
    replyTo: process.env.EMAIL_REPLY_TO!,
    subject: input.subject,
    html: input.html,
    headers: { "X-Entity-Ref-ID": input.idempotencyKey },
  });
  return { mode: "resend" as const, id: result.data?.id, error: result.error?.message };
}
