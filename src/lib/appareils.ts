"use client";

/**
 * Jetons des téléphones reconnus, rangés par maison (qr_token). Un même
 * téléphone peut servir dans plusieurs maisons (ex. une personne qui travaille
 * dans deux foyers). Le jeton seul ne suffit pas : le serveur vérifie aussi
 * qu'il correspond à CETTE maison, et le code maison reste demandé à chaque
 * commande.
 */
const KEY = "akwaba:appareils:v3";

export type AppareilLocal = { jeton: string; code_affichage: string };

function lire(): Record<string, AppareilLocal> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function ecrire(v: Record<string, AppareilLocal>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

export const normaliserQr = (qr: string) => qr.trim().toUpperCase();

export function appareilPour(qr: string): AppareilLocal | null {
  return lire()[normaliserQr(qr)] ?? null;
}

export function enregistrerAppareil(qr: string, a: AppareilLocal) {
  ecrire({ ...lire(), [normaliserQr(qr)]: a });
}

export function oublierAppareil(qr: string) {
  const v = lire();
  delete v[normaliserQr(qr)];
  ecrire(v);
}

/** Toutes les maisons connues de ce téléphone (page avis plateforme). */
export function tousLesAppareils(): (AppareilLocal & { qr: string })[] {
  return Object.entries(lire()).map(([qr, a]) => ({ qr, ...a }));
}

/** Format attendu d'un jeton QR (même alphabet que le serveur, sans 0/O/1/I). */
export const QR_VALIDE = /^[2-9A-HJ-NP-Z]{6}$/;
