"use client";

import { AppError } from "./errors";
import type { Creds } from "./types";

const KEY = "awa:session:v4";

/** Persiste la session active (un seul rôle connecté à la fois dans ce navigateur). */
export function saveSession(creds: Creds) {
  try {
    localStorage.setItem(KEY, JSON.stringify(creds));
  } catch {}
}

export function readSession(): Creds | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Creds;
    if (c && c.role && c.tel && c.token) return c;
  } catch {}
  return null;
}

/** Déconnexion : localStorage + cookie serveur (httpOnly, donc effacé par l'API),
 *  et jeton invalidé en base (l'API le reçoit ici, au cas où le cookie manque). */
export function clearSession() {
  const creds = readSession();
  try {
    localStorage.removeItem(KEY);
  } catch {}
  void fetch("/api/session", {
    method: "DELETE",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: creds ? JSON.stringify(creds) : undefined,
  }).catch(() => {});
}

/**
 * Ouvre la session côté serveur (cookie httpOnly lu par le middleware) et renvoie
 * l'URL du tableau de bord du rôle. Les espaces admin/chauffeur sont sur des
 * chemins secrets que le navigateur n'apprend qu'ici, une fois authentifié.
 */
export async function openSession(creds: Creds): Promise<string> {
  saveSession(creds);
  let r: Response;
  try {
    r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
  } catch {
    throw new AppError("RESEAU");
  }
  if (r.status === 401) {
    clearSession();
    throw new AppError("SESSION_INVALIDE");
  }
  if (r.status === 503) {
    // Vérification serveur impossible : l'espace client n'en dépend pas (pas de
    // chemin secret), on continue. Chauffeur/admin, eux, ont besoin du cookie.
    if (creds.role === "client") return "/dashboard";
    throw new AppError("SERVEUR_PAS_A_JOUR");
  }
  if (!r.ok) throw new AppError("CONFIG", "Espace indisponible : configuration du serveur incomplète.");
  const { home } = (await r.json()) as { home: string };
  return home;
}
