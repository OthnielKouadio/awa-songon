import type { CommandeSource, CommandeStatus, CompteStatut, TricycleStatus } from "./types";

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

export const onlyDigits = (s: string, max = 4) => s.replace(/\D/g, "").slice(0, max);

/** "Cité 2" avant "Cité 10" */
export function byNom<T extends { nom: string }>(a: T, b: T) {
  return a.nom.localeCompare(b.nom, "fr", { numeric: true });
}

export function navigationLink(lat: number, long: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}`;
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

// ─── GPS live (uniquement après « J'arrive chez toi ») ─────────────────────
/** Au-delà de cette ancienneté (ms), la position du chauffeur est périmée (TTL serveur). */
export const POSITION_MAX_AGE_MS = 5 * 60 * 1000;
/** Le partage GPS se coupe tout seul après cette durée (ms). */
export const PARTAGE_GPS_MAX_MS = 10 * 60 * 1000;
/** Il bouge (≥ 15 m depuis le dernier envoi) : 1 envoi toutes les 10 s max. */
export const GPS_SEUIL_MOUVEMENT_M = 15;
export const GPS_INTERVALLE_MOUVEMENT_MS = 10 * 1000;
/** Petit déplacement (entre 5 et 15 m) : 1 envoi toutes les 30 s max. */
export const GPS_SEUIL_ARRET_M = 5;
export const GPS_INTERVALLE_LENT_MS = 30 * 1000;
/** Durée affichée au client quand le chauffeur est parti (« Chauffeur en route - 15 min »). */
export const MINUTES_EN_ROUTE = 15;
/** Au-delà, un tricycle est trop loin du client pour livrer. */
export const DISTANCE_MAX_M = 7000;

/** Une commande programmée n'est plus annulable après cette heure, la veille. */
export const HEURE_LIMITE_ANNULATION = 18;

/** Date du jour à Abidjan (UTC+0), au format YYYY-MM-DD. */
export function jourAbidjan(decalage = 0, now = new Date()): string {
  return new Date(now.getTime() + decalage * 86400000).toISOString().slice(0, 10);
}

/** "2026-12-31" → "31 décembre 2026" */
export function dateLongue(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export const SOURCE_LABEL: Record<CommandeSource, string> = { app: "Application", manual: "Manuel" };

export type FiltreSource = "all" | CommandeSource;
export const FILTRES_SOURCE: { id: FiltreSource; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "app", label: SOURCE_LABEL.app },
  { id: "manual", label: SOURCE_LABEL.manual },
];

/** Prochain 8h00 heure d'Abidjan (UTC+0) : aujourd'hui s'il n'est pas encore 8h, sinon demain. */
export function prochain8h(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8));
  if (now.getTime() >= d.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
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

// ─── Statuts ───────────────────────────────────────────────────────────────
/** Commandes encore à livrer (comptent dans la file et bloquent une 2e commande). */
export const COMMANDES_ACTIVES: CommandeStatus[] = ["QUEUED", "ASSIGNED", "PROGRAMMED", "EN_COURS", "ARRIVING"];
/** Le client peut encore annuler (le chauffeur n'est pas parti). */
export const COMMANDES_ANNULABLES: CommandeStatus[] = ["QUEUED", "ASSIGNED", "PROGRAMMED"];

export const COMMANDE_LABEL: Record<CommandeStatus, string> = {
  QUEUED: "En attente (pause)",
  ASSIGNED: "Dans la file",
  PROGRAMMED: "Programmée",
  EN_COURS: "En route",
  ARRIVING: "Arrive",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

export const CHAUFFEUR_STATUS_LABEL: Record<TricycleStatus, string> = {
  ACTIVE: "Actif",
  PAUSED: "En pause",
  OFFLINE: "Hors ligne",
};

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
// Numéro de dépôt (Wave) : plus de constante ici — il vient de settings.depot_phone,
// modifiable par l'admin (voir useDepotPhone).
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
