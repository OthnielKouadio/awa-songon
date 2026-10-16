/**
 * Chemins secrets — CÔTÉ SERVEUR UNIQUEMENT (middleware, route /api/session,
 * layouts serveur). Ne jamais importer depuis un composant "use client" : les
 * chemins ne doivent pas finir dans le bundle public.
 *
 * Chaque page privée vit dans un dossier réel de src/app (colonne de droite),
 * qui répond 404 : on n'y accède que par le chemin secret de .env.local, que le
 * middleware réécrit vers lui.
 *
 *   DRIVER_SIGNUP_PATH → recrutement-chauffeur  inscription chauffeur (lien envoyé par l'admin)
 *   ADMIN_LOGIN_PATH   → acces-admin            connexion admin (email + mot de passe)
 *   DRIVER_PATH        → chauffeur              espace chauffeur (session chauffeur)
 *   ADMIN_PATH         → admin                  cockpit admin (session admin)
 */
import type { Creds, Role } from "./types";

export const SESSION_COOKIE = "awa_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 jours

/** Dossiers réels sous src/app — jamais accessibles directement. */
export const INTERNAL = {
  driverSignup: "recrutement-chauffeur",
  adminLogin: "acces-admin",
  chauffeur: "chauffeur",
  admin: "admin",
} as const;
export type Area = keyof typeof INTERNAL;

const RESERVED = new Set([...Object.values(INTERNAL), "client", "dashboard", "login", "inscription", "bloque", "suivi", "cgu", "confidentialite", "api", "_next", "icons"]);
const SAFE = /^[A-Za-z0-9_-]{8,64}$/;

function valid(p: string | undefined): string | null {
  return p && SAFE.test(p) && !RESERVED.has(p.toLowerCase()) ? p : null;
}

/** Références statiques à process.env : nécessaires pour le runtime edge du middleware. */
export function privatePaths() {
  return {
    driverSignup: valid(process.env.DRIVER_SIGNUP_PATH),
    adminLogin: valid(process.env.ADMIN_LOGIN_PATH),
    chauffeur: valid(process.env.DRIVER_PATH),
    admin: valid(process.env.ADMIN_PATH),
  } satisfies Record<Area, string | null>;
}

/** Tableau de bord de chaque rôle (null = chemin secret absent ou invalide dans l'env). */
export function homeFor(role: Role): string | null {
  if (role === "client") return "/dashboard";
  const p = privatePaths()[role];
  return p ? `/${p}` : null;
}

export function parseCreds(raw: unknown): Creds | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if ((c.role === "client" || c.role === "chauffeur" || c.role === "admin") && typeof c.tel === "string" && typeof c.token === "string" && c.tel && c.token.length >= 16 && c.token.length <= 128) {
    return { role: c.role, tel: c.tel, token: c.token };
  }
  return null;
}

export function readSessionCookie(value: string | undefined): Creds | null {
  if (!value) return null;
  try {
    return parseCreds(JSON.parse(value));
  } catch {
    return null;
  }
}

/** Le jeton est-il toujours valide pour ce rôle ? Vérifié en base (RPC session_valide).
 *  Mode démo : les sessions vivent dans le localStorage du navigateur, invérifiables
 *  côté serveur — on fait confiance au cookie (aucune donnée réelle derrière). */
export async function verifySession(c: Creds): Promise<boolean> {
  return (await checkSession(c)) === "valide";
}

/** Déconnexion : efface le jeton en base (RPC session_fermer), pour qu'une copie
 *  volée ne serve plus. Best effort : un échec ne bloque pas la déconnexion locale. */
export async function closeSession(c: Creds): Promise<void> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/rpc/session_fermer`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_role: c.role, p_tel: c.tel, p_token: c.token }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[session] fermeture impossible", e);
  }
}

/** Comme verifySession, mais distingue un jeton refusé d'une vérification
 *  impossible (base injoignable, schema.sql pas appliqué…) pour ne pas afficher
 *  « numéro ou code incorrect » à quelqu'un qui vient de s'inscrire. */
export async function checkSession(c: Creds): Promise<"valide" | "invalide" | "erreur"> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return "valide";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "erreur";
  try {
    const r = await fetch(`${url}/rest/v1/rpc/session_valide`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_role: c.role, p_tel: c.tel, p_token: c.token }),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`[session] session_valide a échoué (${r.status}) : ${(await r.text()).slice(0, 200)}`);
      return "erreur";
    }
    return (await r.json()) === true ? "valide" : "invalide";
  } catch (e) {
    console.error("[session] Supabase injoignable", e);
    return "erreur";
  }
}
