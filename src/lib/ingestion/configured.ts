import "server-only";
import { localExtract } from "@/lib/extraction/local";
import { extractRelevantWithFallback } from "@/lib/extraction/openai";
import { XApiSourceAdapter } from "@/lib/social/adapters";
import { runIngestion } from "./service";
import { SupabaseIngestionRepository } from "./supabase-repository";
import { getServiceSupabase } from "@/lib/supabase/server";

let inFlight: Promise<Awaited<ReturnType<typeof runIngestion>>> | null = null;

export function runConfiguredIngestion() {
  if (inFlight) return inFlight;
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X source is unavailable");
  const repository = new SupabaseIngestionRepository(getServiceSupabase());
  const source = new XApiSourceAdapter(token);
  inFlight = runIngestion({
    repository,
    source,
    username: process.env.X_USERNAME ?? "thsottiaux",
    localExtract,
    extractRelevant: extractRelevantWithFallback,
  }).finally(() => { inFlight = null; });
  return inFlight;
}
