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

/** Distance à vol d'oiseau entre 2 points GPS (Haversine), en mètres. */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 850 → "850 m" ; 1800 → "1.8 km" */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Au-delà de cette ancienneté (ms), on considère la position du chauffeur périmée. */
export const POSITION_MAX_AGE_MS = 2 * 60 * 1000;

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

// ─── Points (1 FCFA = 1 point) — système 100% recharge, clients ET chauffeurs ──
export const NUMERO_RECHARGE = "0566036825";
export const NUMERO_RECHARGE_2 = "0789855418";
/** Un montant de recharge doit être un multiple de ça. */
export const RECHARGE_MULTIPLE = 50;
/** Montant minimum conseillé pour une recharge Wave (en FCFA = en points). */
export const RECHARGE_MIN_FCFA = 1000;

// Chauffeur
/** Coût d'une livraison assignée (1 citerne = 1000 L = cette appli n'a qu'une quantité), déduit à la création de la commande. */
export const POINTS_PAR_LIVRAISON = 50;
/** Sous ce solde, le chauffeur passe is_offline (invisible des clients). */
export const SOLDE_MIN = 50;
/** Offerts automatiquement à l'inscription du chauffeur. */
export const BONUS_INSCRIPTION = 2500;
/** Total de points utilisés (cumulé) qui déclenche le bonus fidélité ci-dessous. */
export const SEUIL_FIDELITE = 5000;
/** Points offerts automatiquement dès que SEUIL_FIDELITE est atteint. */
export const BONUS_FIDELITE_POINTS = 50;
/** Livraisons gratuites obtenues avec le bonus d'inscription (2500 / 50 = 50). */
export const LIVRAISONS_ESSAI = BONUS_INSCRIPTION / POINTS_PAR_LIVRAISON;
/** Citernes livrées pour atteindre le seuil de fidélité (5000 / 50 = 100). */
export const CITERNES_FIDELITE = SEUIL_FIDELITE / POINTS_PAR_LIVRAISON;

// Client
/** Offerts automatiquement à l'inscription du client (~12 commandes). */
export const BONUS_INSCRIPTION_CLIENT = 1200;
/** Coût d'une commande créée, déduit immédiatement du solde du client. */
export const COUT_COMMANDE_CLIENT = 100;
/** Sous ce solde, le client ne peut plus commander (redirection /bloque). */
export const SOLDE_MIN_CLIENT = 100;
/** Commandes gratuites obtenues avec le bonus d'inscription (1200 / 100 = 12). */
export const COMMANDES_ESSAI_CLIENT = BONUS_INSCRIPTION_CLIENT / COUT_COMMANDE_CLIENT;

/** 1000 → "1 000 pts" */
export function formatPoints(n: number) {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} pts`;
}
