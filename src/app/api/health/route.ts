import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Sonde de disponibilité (UptimeRobot, Better Stack…) : 200 si la base répond,
 *  503 sinon. Lit `cites`, seule table ouverte en lecture à la clé anon (les
 *  autres sont fermées par RLS + revoke, voir supabase/schema.sql). */
export async function GET() {
  const timestamp = new Date().toISOString();
  const headers = { "Cache-Control": "no-store" };
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ status: "ok", db: "demo", timestamp }, { headers });
  }
  const sb = getSupabase();
  let db: "ok" | "error" | "non_configuree" = "non_configuree";
  if (sb) {
    const { error } = await sb.from("cites").select("id").limit(1);
    if (error) console.error("[health] Supabase :", error.message);
    db = error ? "error" : "ok";
  }
  const ok = db === "ok";
  return NextResponse.json({ status: ok ? "ok" : "degraded", db, timestamp }, { status: ok ? 200 : 503, headers });
}
