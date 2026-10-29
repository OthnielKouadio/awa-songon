import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Sonde de disponibilité (UptimeRobot, Better Stack…) : 200 si la base répond,
 *  503 sinon. Appelle la RPC sante(), qui ne lit aucune donnée (toutes les
 *  tables sont fermées aux visiteurs, voir supabase/schema.sql). */
export async function GET() {
  const timestamp = new Date().toISOString();
  const headers = { "Cache-Control": "no-store" };
  const sb = getSupabase();
  let db: "ok" | "error" | "non_configuree" = "non_configuree";
  if (sb) {
    const { error } = await sb.rpc("sante");
    if (error) console.error("[health] Supabase :", error.message);
    db = error ? "error" : "ok";
  }
  const ok = db === "ok";
  return NextResponse.json({ status: ok ? "ok" : "degraded", db, timestamp }, { status: ok ? 200 : 503, headers });
}
