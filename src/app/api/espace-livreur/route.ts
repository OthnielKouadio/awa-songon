import { NextResponse } from "next/server";
import { basesEspaces } from "@/lib/chemins";

export const dynamic = "force-dynamic";

/**
 * Adresse (secrète) de l'espace livreur, révélée UNIQUEMENT à un livreur dont
 * le jeton est valide (vérifié en base par l_espace). Sert à /login.
 */
export async function POST(req: Request) {
  let jeton = "";
  try {
    const b = (await req.json()) as { jeton?: unknown };
    jeton = typeof b.jeton === "string" && /^[0-9a-f]{64}$/.test(b.jeton) ? b.jeton : "";
  } catch {}
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!jeton || !url || !key) return NextResponse.json({ erreur: "SESSION" }, { status: 401 });
  const r = await fetch(`${url}/rest/v1/rpc/l_espace`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_jeton: jeton }),
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return NextResponse.json({ erreur: "SESSION" }, { status: 401 });
  return NextResponse.json({ home: basesEspaces().livreur }, { headers: { "Cache-Control": "no-store" } });
}
