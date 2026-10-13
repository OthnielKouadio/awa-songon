import { NextResponse } from "next/server";
import { checkSession, homeFor, parseCreds, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/private-routes";

export const dynamic = "force-dynamic";

/** Après login/inscription : vérifie le jeton en base, pose le cookie httpOnly lu par
 *  le middleware, et renvoie le tableau de bord du rôle (seul moyen pour le
 *  navigateur d'apprendre un chemin secret : il faut déjà être authentifié). */
export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {}
  const creds = parseCreds(body);
  if (!creds) return NextResponse.json({ error: "SESSION_INVALIDE" }, { status: 401 });
  const etat = await checkSession(creds);
  if (etat === "invalide") return NextResponse.json({ error: "SESSION_INVALIDE" }, { status: 401 });
  if (etat === "erreur") return NextResponse.json({ error: "SERVEUR_PAS_A_JOUR" }, { status: 503 });
  const home = homeFor(creds.role);
  if (!home) {
    console.error(`[session] chemin secret manquant ou invalide pour le rôle ${creds.role} (DRIVER_PATH / ADMIN_PATH)`);
    return NextResponse.json({ error: "CONFIG" }, { status: 500 });
  }
  const res = NextResponse.json({ home });
  res.cookies.set(SESSION_COOKIE, JSON.stringify(creds), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
