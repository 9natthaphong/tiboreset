import { Resend } from "resend";

export type EmailConfigurationStatus = "disabled" | "configured" | "configuration_error";

export function getEmailConfigurationStatus(env: Readonly<Record<string, string | undefined>> = process.env): EmailConfigurationStatus {
  const values = [env.RESEND_API_KEY, env.EMAIL_FROM, env.EMAIL_REPLY_TO, env.RESEND_WEBHOOK_SECRET];
  if (values.every(value => !value)) return "disabled";
  return values.every(value => Boolean(value)) ? "configured" : "configuration_error";
}

let resendClient: Resend | null = null;
export function getResendClient() {
  if (!process.env.RESEND_API_KEY) throw new Error("Email delivery is unavailable");
  return resendClient ??= new Resend(process.env.RESEND_API_KEY);
}
