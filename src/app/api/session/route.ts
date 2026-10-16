import { NextResponse, type NextRequest } from "next/server";
import { checkSession, closeSession, homeFor, parseCreds, readSessionCookie, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/private-routes";
import type { Creds } from "@/lib/types";

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

/** Déconnexion : jeton effacé en base (celui du cookie, et celui envoyé par le
 *  navigateur s'il diffère — client sans cookie), puis cookie supprimé. */
export async function DELETE(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {}
  const parJeton = new Map<string, Creds>();
  for (const c of [readSessionCookie(req.cookies.get(SESSION_COOKIE)?.value), parseCreds(body)]) if (c) parJeton.set(c.token, c);
  await Promise.all([...parJeton.values()].map(closeSession));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
