import { BONUS_FIDELITE_POINTS, COUT_COMMANDE_CLIENT, POINTS_PAR_LIVRAISON, QUANTITE_L } from "./format";
import type { ChauffeurHistorique, ClientHistorique } from "./types";

/** Consommation d'eau d'un client sur un mois (seules les commandes livrées comptent). */
export type ConsoMois = {
  /** "2026-10" */
  cle: string;
  citernes: number;
  litres: number;
  /** Prix de l'eau payé aux chauffeurs (FCFA). */
  eau: number;
  /** Points réellement débités (100 par commande passée dans l'appli). */
  frais: number;
  /** Points qui auraient été débités sans l'essai gratuit (simulation). */
  fraisOfferts: number;
  annulees: number;
  commandes: ClientHistorique[];
};

/** Mois d'une commande (heure d'Abidjan = UTC) : jour de livraison, sinon de création. */
const moisDe = (c: { livree_at: string | null; created_at: string }) => (c.livree_at ?? c.created_at).slice(0, 7);

/** "2026-10" du jour. */
export const moisCourant = (now = new Date()) => now.toISOString().slice(0, 7);

export function consoVide(cle: string): ConsoMois {
  return { cle, citernes: 0, litres: 0, eau: 0, frais: 0, fraisOfferts: 0, annulees: 0, commandes: [] };
}

/** Regroupe l'historique par mois, plus récent d'abord. */
export function consoParMois(rows: ClientHistorique[]): ConsoMois[] {
  const parMois = new Map<string, ConsoMois>();
  for (const c of rows) {
    const cle = moisDe(c);
    const m = parMois.get(cle) ?? consoVide(cle);
    parMois.set(cle, m);
    m.commandes.push(c);
    if (c.status === "ANNULEE") m.annulees += 1;
    if (c.status !== "LIVREE") continue;
    m.citernes += 1;
    m.litres += QUANTITE_L;
    m.eau += c.prix;
    if (c.client_debite) m.frais += COUT_COMMANDE_CLIENT;
    else if (c.source === "app") m.fraisOfferts += COUT_COMMANDE_CLIENT;
  }
  return [...parMois.values()].sort((a, b) => b.cle.localeCompare(a.cle));
}

/** Simulation : ce que le mois aurait coûté sans l'essai gratuit (eau + frais d'appli). */
export const totalHorsEssai = (m: ConsoMois) => m.eau + m.frais + m.fraisOfferts;

/** Projection sur le mois entier au rythme des jours déjà écoulés (null si rien livré). */
export function projectionMois(m: ConsoMois, now = new Date()): number | null {
  if (m.citernes === 0 || m.cle !== moisCourant(now)) return null;
  const jour = now.getUTCDate();
  const joursDansMois = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.round((totalHorsEssai(m) / jour) * joursDansMois);
}

/** "2026-10" → "Octobre 2026" */
export function nomMois(cle: string): string {
  const s = new Date(`${cle}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 3000 → "3 000 L" */
export const formatLitres = (l: number) => `${l.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} L`;

// ─── Chauffeur ─────────────────────────────────────────────────────────────

/** Activité d'un chauffeur sur un mois (seules les commandes livrées comptent). */
export type StatsChauffeurMois = {
  cle: string;
  livraisons: number;
  litres: number;
  /** Prix de l'eau encaissé auprès des clients (FCFA). */
  encaisse: number;
  app: number;
  manuel: number;
  /** Points réellement dépensés : 50 par livraison débitée, moins les livraisons offertes (bonus). */
  points: number;
  /** Points qui auraient été dépensés sans l'essai gratuit (simulation). */
  pointsOfferts: number;
  /** Livraisons offertes par le programme fidélité. */
  bonus: number;
  annulees: number;
  commandes: ChauffeurHistorique[];
};

export function statsChauffeurVide(cle: string): StatsChauffeurMois {
  return { cle, livraisons: 0, litres: 0, encaisse: 0, app: 0, manuel: 0, points: 0, pointsOfferts: 0, bonus: 0, annulees: 0, commandes: [] };
}

/** Regroupe l'historique du chauffeur par mois, plus récent d'abord. */
export function statsChauffeurParMois(rows: ChauffeurHistorique[]): StatsChauffeurMois[] {
  const parMois = new Map<string, StatsChauffeurMois>();
  for (const c of rows) {
    const cle = moisDe(c);
    const m = parMois.get(cle) ?? statsChauffeurVide(cle);
    parMois.set(cle, m);
    m.commandes.push(c);
    if (c.status === "ANNULEE") m.annulees += 1;
    if (c.status !== "LIVREE") continue;
    m.livraisons += 1;
    m.litres += QUANTITE_L;
    m.encaisse += c.prix;
    if (c.source === "app") m.app += 1;
    else m.manuel += 1;
    if (c.chauffeur_debite) m.points += POINTS_PAR_LIVRAISON;
    else m.pointsOfferts += POINTS_PAR_LIVRAISON;
    if (c.chauffeur_bonus) {
      m.bonus += 1;
      m.points -= BONUS_FIDELITE_POINTS;
    }
  }
  return [...parMois.values()].sort((a, b) => b.cle.localeCompare(a.cle));
}
