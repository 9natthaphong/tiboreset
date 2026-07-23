export type IngestionFailureCategory =
  | "x_rate_limit"
  | "x_authorization"
  | "x_billing"
  | "provider_timeout"
  | "provider_network"
  | "openai"
  | "database"
  | "unknown";

export type SafeIngestionFailure = {
  category: IngestionFailureCategory;
  message: string;
};

export function sanitizeIngestionFailure(error: unknown): SafeIngestionFailure {
  const raw = error instanceof Error ? error.message : "";
  const message = raw.toLowerCase();

  if (/\b429\b|rate.?limit/.test(message)) {
    return { category: "x_rate_limit", message: "X source rate limit prevented this check" };
  }
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/.test(message)) {
    return { category: "x_authorization", message: "X source authorization prevented this check" };
  }
  if (/billing|credit|payment/.test(message)) {
    return { category: "x_billing", message: "X source billing state prevented this check" };
  }
  if (/timeout|timed out|abort/.test(message)) {
    return { category: "provider_timeout", message: "The source check timed out" };
  }
  if (/x api request failed|x source is unavailable|fetch|network|dns|enotfound|econn|tls|certificate/.test(message)) {
    return { category: "provider_network", message: "The source network request failed" };
  }
  if (/openai/.test(message)) {
    return { category: "openai", message: "Evidence extraction failed" };
  }
  if (/supabase|postgres|database|forecast|ingestion run|unable to (start|read|insert|update|load|persist|synchronize|record|upsert)/.test(message)) {
    return { category: "database", message: "A database operation failed during ingestion" };
  }
  return { category: "unknown", message: "Ingestion failed" };
}
