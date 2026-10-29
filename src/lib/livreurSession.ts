"use client";

/** Jeton de session du livreur (navigateur). Le serveur ne garde que son hash. */
const KEY = "akwaba:livreur:v3";

export function lireJetonLivreur(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function ecrireJetonLivreur(j: string | null) {
  try {
    if (j) localStorage.setItem(KEY, j);
    else localStorage.removeItem(KEY);
  } catch {}
}
