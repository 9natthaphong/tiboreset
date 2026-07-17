import { afterEach, describe, expect, it } from "vitest";
import { externalContextDatasetSchema, loadExternalContextEvents, ReviewedOpenAIStatusAdapter } from "@/lib/external-context";
import { versionedForecastContext } from "@/lib/forecast-context";
import { getEmailConfigurationStatus } from "@/lib/notifications/email-config";
import { verifyResendWebhook } from "@/lib/notifications/verify-resend-webhook";

describe("reviewed context and derived forecast context", () => {
  it("loads only strict reviewed official competitor context with zero forecast weight", () => {
    const dataset = loadExternalContextEvents();
    expect(dataset.events).toHaveLength(2);
    expect(dataset.events.every(event => event.verificationStatus === "reviewed" && event.forecastWeight === 0)).toBe(true);
    expect(() => externalContextDatasetSchema.parse({
      ...dataset,
      events: [{ ...dataset.events[0], forecastWeight: .4 }],
    })).toThrow();
  });

  it("accepts only reviewed official OpenAI Status incidents as operational signals", () => {
    const source = {
      schemaVersion: "1.0.0",
      datasetVersion: "test",
      policy: "human-reviewed-official-sources-only",
      events: [{
        id: "openai-status-reviewed",
        provider: "OpenAI",
        category: "openai_status_incident",
        title: "Reviewed Codex incident",
        occurredAt: "2026-07-17T00:00:00.000Z",
        sourceUrl: "https://status.openai.com/incidents/example",
        sourceType: "official_status_page",
        verificationStatus: "reviewed",
        description: "A manually reviewed operational incident.",
        forecastWeight: .5,
        rationale: "Explicit reviewed usage-incident input.",
      }, {
        id: "openai-unreviewed",
        provider: "OpenAI",
        category: "openai_status_incident",
        title: "Unreviewed incident",
        occurredAt: "2026-07-17T00:00:00.000Z",
        sourceUrl: "https://status.openai.com/incidents/unreviewed",
        sourceType: "official_status_page",
        verificationStatus: "unverified",
        description: "Not yet reviewed.",
        forecastWeight: 0,
        rationale: "Not used until reviewed.",
      }],
    };
    expect(new ReviewedOpenAIStatusAdapter(source).load().map(event => event.id)).toEqual(["openai-status-reviewed"]);
  });

  it("uses the verified combined 9M observation toward the pledged 10M milestone", () => {
    const context = versionedForecastContext("2026-07-17T00:00:00.000Z");
    expect(context.milestoneObservations.at(-1)?.milestoneUsers).toBe(9_000_000);
    expect(context.nextPledgedMilestoneUsers).toBe(10_000_000);
    expect(context.verifiedResets.some(reset => reset.occurredAt.startsWith("2026-05-31"))).toBe(false);
  });
});

describe("Resend configuration and signature gate", () => {
  const keys = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO", "RESEND_WEBHOOK_SECRET"] as const;
  const originals = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  afterEach(() => {
    for (const key of keys) {
      const original = originals[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it("reports disabled, configuration_error, and configured without exposing values", () => {
    expect(getEmailConfigurationStatus({})).toBe("disabled");
    expect(getEmailConfigurationStatus({ RESEND_API_KEY: "present" })).toBe("configuration_error");
    expect(getEmailConfigurationStatus({ RESEND_API_KEY: "present", EMAIL_FROM: "alerts@example.com", EMAIL_REPLY_TO: "reply@example.com", RESEND_WEBHOOK_SECRET: "present" })).toBe("configured");
  });

  it("rejects missing, invalid, and expired Svix signatures", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "alerts@example.com";
    process.env.EMAIL_REPLY_TO = "reply@example.com";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_dGVzdA==";
    expect(verifyResendWebhook("{}", { id: null, timestamp: null, signature: null }).ok).toBe(false);
    expect(verifyResendWebhook("{}", { id: "msg_test", timestamp: "0", signature: "v1,invalid" }).ok).toBe(false);
  });
});
