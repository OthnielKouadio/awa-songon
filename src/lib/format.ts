/** Formats d'affichage (fr-CI) et règles métier partagées (reprises de la V2). */

export const fcfa = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
export const points = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} point${Math.abs(n) > 1 ? "s" : ""}`;

const TZ = "Africa/Abidjan";
export const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
export const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** Une commande = un voyage = 1000 L. Il n'y a pas d'autre quantité. */
export const QUANTITE_L = 1000;

// ─── Statuts ─────────────────────────────────────────────────────────────────

export type StatutCommande = "EN_ATTENTE" | "EN_PAUSE" | "PROGRAMMEE" | "EN_ROUTE" | "ARRIVE" | "LIVREE" | "ANNULEE";
export type StatutLivreur = "ACTIF" | "PAUSE" | "HORS_LIGNE" | "BLOQUE";

export const STATUT_COMMANDE: Record<string, string> = {
  EN_ATTENTE: "Dans la file",
  EN_PAUSE: "En attente (pause)",
  PROGRAMMEE: "Programmée",
  EN_ROUTE: "En route",
  ARRIVE: "Arrive",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};
/** Le foyer peut encore annuler (le livreur n'est pas parti). */
export const ANNULABLES: string[] = ["EN_ATTENTE", "EN_PAUSE", "PROGRAMMEE"];

export const STATUT_LIVREUR: Record<string, string> = { ACTIF: "En service", PAUSE: "En pause", HORS_LIGNE: "Hors ligne", BLOQUE: "Bloqué" };
/** Ce qui arrive à une commande passée maintenant, selon le statut du livreur. */
export const EFFET_STATUT: Record<string, string> = {
  ACTIF: "Livraison aujourd'hui",
  PAUSE: "En pause : livré aujourd'hui",
  HORS_LIGNE: "Hors ligne : programmé demain 8h",
};

// ─── Temps estimés (V2) ──────────────────────────────────────────────────────

/** Temps estimé = position dans la file × 35 minutes. */
export const MINUTES_PAR_LIVRAISON = 35;
export const estimerMinutes = (position: number) => Math.max(1, position) * MINUTES_PAR_LIVRAISON;
/** Durée affichée quand le livreur est parti (« Livreur en route - 15 min »). */
export const MINUTES_EN_ROUTE = 15;
export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** "demain 8h" / "aujourd'hui 8h" / "lun. 14 oct. 8h" pour une commande programmée. */
export function formatProgrammee(iso: string | null): string {
  if (!iso) return "demain 8h";
  const d = new Date(iso);
  const jourIso = (x: Date) => x.toISOString().slice(0, 10);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const h = `${d.getUTCHours()}h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, "0") : ""}`;
  if (jourIso(d) === jourIso(today)) return `aujourd'hui ${h}`;
  if (jourIso(d) === jourIso(tomorrow)) return `demain ${h}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ${h}`;
}

// ─── GPS en direct (uniquement après « J'arrive chez toi ») ─────────────────

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
export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
/** Il bouge (≥ 15 m depuis le dernier envoi) : 1 envoi toutes les 10 s max. */
export const GPS_SEUIL_MOUVEMENT_M = 15;
export const GPS_INTERVALLE_MOUVEMENT_MS = 10 * 1000;
/** Petit déplacement (entre 5 et 15 m) : 1 envoi toutes les 30 s max. */
export const GPS_SEUIL_ARRET_M = 5;
export const GPS_INTERVALLE_LENT_MS = 30 * 1000;

// ─── Points et paiement ──────────────────────────────────────────────────────

/** Mention obligatoire sous chaque bouton de recharge. */
export const MENTION_NON_REMBOURSABLE = "Crédit non remboursable";
/** Texte exact de la case à cocher à la création du foyer. */
export const CGV_CASE =
  "J'accepte que les recharges sont non remboursables, non échangeables contre de l'argent. Ce sont des crédits de livraison.";

/** Fidélité livreur : +50 points offerts dès 5000 points utilisés. */
export const SEUIL_FIDELITE = 5000;
export const BONUS_FIDELITE_POINTS = 50;

// Paiement Wave marchand (sans frais pour le client).
// Fixé dans le code EXPRÈS, jamais modifiable depuis l'admin : pour détourner les
// paiements, il faudrait un accès au dépôt Git ET au déploiement, pas seulement
// un mot de passe admin volé. Pour changer de lien : modifier ici, commit, déployer.
const WAVE_LIEN = "https://pay.wave.com/m/M_ci_4ni9H1CmB-NB/c/ci/";
/** Nom du marchand par défaut : le vrai vient des réglages admin (wave_marchand).
 *  Le client le vérifie sur l'écran Wave avant de payer. */
export const WAVE_MARCHAND_DEFAUT = "Jeune roi hub";
/** Seul un lien marchand Wave Côte d'Ivoire est accepté : une faute de frappe
 *  ou un lien piégé masque le bouton au lieu d'envoyer le client ailleurs. */
export const WAVE_PAY_URL: string | null = /^https:\/\/pay\.wave\.com\/m\/M_ci_[A-Za-z0-9_-]+\/c\/ci\/?$/.test(WAVE_LIEN) ? WAVE_LIEN : null;
