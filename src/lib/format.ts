import type { CompteStatut } from "./types";

/** Une commande = un voyage = 1000 L. Il n'y a pas d'autre quantité. */
export const QUANTITE_L = 1000;

/** Prix indicatif proposé à l'inscription (le chauffeur le modifie). */
export const PRIX_DEFAUT = 2500;
export const PRIX_MIN = 100;
export const PRIX_MAX = 50000;

/** 2500 → "2 500 FCFA" */
export function formatFcfa(n: number) {
  const groupes = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${groupes} FCFA`;
}

/** Temps estimé = position dans la file × 35 minutes. */
export const MINUTES_PAR_LIVRAISON = 35;

export function estimerMinutes(position: number) {
  return Math.max(1, position) * MINUTES_PAR_LIVRAISON;
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function normalizePhone(p: string) {
  return p.replace(/[^0-9+]/g, "");
}

export function isValidPhone(p: string) {
  const n = normalizePhone(p);
  return n.length >= 8 && n.length <= 16;
}

export const onlyDigits = (s: string, max = 4) => s.replace(/\D/g, "").slice(0, max);

/** "Cité 2" avant "Cité 10" */
export function byNom<T extends { nom: string }>(a: T, b: T) {
  return a.nom.localeCompare(b.nom, "fr", { numeric: true });
}

export function navigationLink(lat: number, long: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
}

export function callLink(tel: string) {
  return `tel:${normalizePhone(tel)}`;
}

export function heure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function jour(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export const STATUT_LABEL: Record<CompteStatut, string> = {
  PAYE: "Payé",
  IMPAYE: "Impayé",
  BLOQUE: "Bloqué",
};
