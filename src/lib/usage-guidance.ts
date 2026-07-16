export type UsageGuidance = {
  band: "LOW" | "WATCH" | "PLAUSIBLE" | "STRONG" | "CONFIRMED";
  title: string;
  guidance: string;
};

export function getUsageGuidance(probability: number, confirmed = false): UsageGuidance {
  const percent = probability <= 1 ? Math.round(probability * 100) : Math.round(probability);
  if (confirmed) return { band: "CONFIRMED", title: "A reset announcement was detected", guidance: "Verify that your account and plan have received it before changing your workflow." };
  if (percent < 30) return { band: "LOW", title: "Conserve for important work", guidance: "No reset looks imminent. Keep your remaining quota focused on the tasks that matter most." };
  if (percent < 60) return { band: "WATCH", title: "Signals are beginning to form", guidance: "Use quota normally, but keep critical tasks prioritized while the evidence develops." };
  if (percent < 80) return { band: "PLAUSIBLE", title: "A reset is becoming plausible", guidance: "This may be a reasonable window to use more of your remaining quota while continuing to monitor for confirmation." };
  return { band: "STRONG", title: "Strong reset signals detected", guidance: "Consider finishing quota-heavy work while monitoring the public evidence for confirmation." };
}
