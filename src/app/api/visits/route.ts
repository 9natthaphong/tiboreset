import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const visitSchema = z.object({
  visitorToken: z.string().uuid(),
}).strict();

function counterIsAvailable() {
  return process.env.NODE_ENV === "production"
    && process.env.NEXT_PUBLIC_APP_MODE === "live"
    && isServiceSupabaseConfigured();
}

function unavailable() {
  return NextResponse.json({ error: "Visit counter unavailable" }, {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

async function readCount() {
  const { count, error } = await getServiceSupabase()
    .from("public_visit_days")
    .select("id", { count: "exact", head: true });
  if (error || count === null) throw new Error("Visit count unavailable");
  return count;
}

export async function GET() {
  if (!counterIsAvailable()) return unavailable();
  try {
    const count = await readCount();
    return NextResponse.json({ count }, {
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  if (!counterIsAvailable()) return unavailable();
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  let input: z.infer<typeof visitSchema>;
  try {
    input = visitSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid visit token" }, { status: 400 });
  }

  try {
    const visitDay = new Date().toISOString().slice(0, 10);
    const visitorHash = createHash("sha256")
      .update(`${input.visitorToken}:${visitDay}`)
      .digest("hex");
    const { error } = await getServiceSupabase()
      .from("public_visit_days")
      .upsert({ visit_day: visitDay, visitor_hash: visitorHash }, {
        onConflict: "visit_day,visitor_hash",
        ignoreDuplicates: true,
      });
    if (error) throw new Error("Visit write unavailable");
    const count = await readCount();
    return NextResponse.json({ count }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return unavailable();
  }
}
