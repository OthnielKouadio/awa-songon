"use client";

import type { Creds, Role } from "./types";

const KEY = "awa:session:v4";

/** Tableau de bord de chaque rôle une fois connecté. */
export const HOME: Record<Role, string> = { client: "/dashboard", chauffeur: "/chauffeur", admin: "/admin" };

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

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
