import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

async function main() {
  loadEnvConfig(process.cwd());
  const index = process.argv.indexOf("--contains");
  const contains = index >= 0 ? process.argv[index + 1]?.trim() : null;
  if (!contains) throw new Error("Usage: npm run find:x-post -- --contains \"text\"");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service connection is unavailable");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const result = await client.from("source_posts").select("platform_post_id,text,posted_at,post_url").ilike("text", `%${contains.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`).order("posted_at", { ascending: false }).limit(20);
  if (result.error) throw new Error(`Stored-post lookup failed: ${result.error.message}`);
  console.log(JSON.stringify(result.data ?? [], null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stored-post lookup failed");
  process.exitCode = 1;
});
