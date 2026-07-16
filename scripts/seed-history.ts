import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { importHistoricalSeeds } from "../src/lib/historical-data";
import { SupabaseHistoricalSeedRepository } from "../src/lib/historical-data/supabase-seed-repository";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server credentials are unavailable");
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const result = await importHistoricalSeeds(new SupabaseHistoricalSeedRepository(client));
  console.log({ ok: true, ...result });
}

void main().catch(error => {
  console.error({ ok: false, error: error instanceof Error ? error.message : "Historical seed import failed" });
  process.exitCode = 1;
});
