import type { StatsMois, YearlyStats } from "./types";

export const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const MOIS_COURT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
export const ANNEES = [2024, 2025, 2026];

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);

/** Dernier mois écoulé de l'année (12 pour une année passée, le mois courant pour l'année en cours). */
export function dernierMois(annee: number, now = new Date()): number {
  const an = now.getUTCFullYear();
  return annee < an ? 12 : annee > an ? 0 : now.getUTCMonth() + 1;
}
const somme = (rows: StatsMois[], k: keyof StatsMois) => rows.reduce((s, r) => s + ((r[k] as number | null) ?? 0), 0);

/** Moyenne des temps mensuels pondérée par le nombre de livraisons chronométrées. */
function tempsPondere(rows: StatsMois[]): number | null {
  const n = somme(rows, "livrees_chronometrees");
  if (!n) return null;
  return Math.round(rows.reduce((s, r) => s + (r.temps_moyen_min ?? 0) * r.livrees_chronometrees, 0) / n);
}

export type Kpis = ReturnType<typeof calculerKpis>;

/** KPIs de la période : l'année entière (mois = 0) ou un mois précis. */
export function calculerKpis(s: YearlyStats, mois: number) {
  const rows = mois ? [s.mois[mois - 1]] : s.mois;
  const total = somme(rows, "total");
  // Année en cours : comparaison à la même période de l'an dernier, pas à l'année entière.
  const fin = dernierMois(s.annee);
  const comparables = mois ? rows : s.mois.slice(0, fin);
  const precedent = somme(comparables, "total_annee_precedente");
  const app = somme(rows, "app");
  const manual = somme(rows, "manual");
  const livrees = somme(rows, "livrees");
  const annulees = somme(rows, "annulees");
  const echecs = somme(rows, "echecs");
  const ca = somme(rows, "ca");
  const clientsActifs = mois ? rows[0].clients_uniques : s.synthese.clients_actifs;
  return {
    total,
    variation: pct(total - precedent, precedent),
    precedent,
    /** Mois couverts par la comparaison (année en cours incomplète), sinon null. */
    periodeComparee: !mois && fin > 0 && fin < 12 ? fin : null,
    app,
    appPct: pct(app, total),
    manual,
    manualPct: pct(manual, total),
    bidons: somme(rows, "bidons"),
    livrees,
    ca,
    caMoyenMois: mois ? null : ca / 12,
    panierMoyen: livrees ? ca / livrees : null,
    remboursements: somme(rows, "remboursements_montant"),
    remboursementsNb: somme(rows, "remboursements_nb"),
    clientsActifs,
    revenuParClient: clientsActifs ? ca / clientsActifs : null,
    nouveaux: mois ? rows[0].nouveaux : s.synthese.nouveaux,
    recurrents: mois ? rows[0].clients_plus_3 : s.synthese.clients_plus_3,
    tauxReussite: pct(livrees, total),
    tauxAnnulation: pct(annulees, total),
    tauxEchec: pct(echecs, total),
    tempsMoyen: mois ? rows[0].temps_moyen_min : s.synthese.temps_moyen_min,
  };
}

export type LigneRecap = {
  mois: number;
  label: string;
  total: number;
  app: number;
  manual: number;
  manualPct: number | null;
  bidons: number;
  ca: number;
  clients: number;
  reussite: number | null;
  temps: number | null;
  remboursements: number;
  remboursementsNb: number;
};

const ligne = (r: StatsMois): LigneRecap => ({
  mois: r.mois,
  label: MOIS[r.mois - 1],
  total: r.total,
  app: r.app,
  manual: r.manual,
  manualPct: pct(r.manual, r.total),
  bidons: r.bidons,
  ca: r.ca,
  clients: r.clients_uniques,
  reussite: pct(r.livrees, r.total),
  temps: r.temps_moyen_min,
  remboursements: r.remboursements_montant,
  remboursementsNb: r.remboursements_nb,
});

/** Lignes mensuelles + ligne Total (clients = clients distincts de l'année, pas une somme). */
export function recapMensuel(s: YearlyStats, mois: number): { lignes: LigneRecap[]; total: LigneRecap } {
  const rows = mois ? [s.mois[mois - 1]] : s.mois;
  const t = calculerKpis(s, mois);
  return {
    lignes: rows.map(ligne),
    total: {
      mois: 0,
      label: "Total",
      total: t.total,
      app: t.app,
      manual: t.manual,
      manualPct: t.manualPct,
      bidons: t.bidons,
      ca: t.ca,
      clients: t.clientsActifs,
      reussite: t.tauxReussite,
      temps: tempsPondere(rows),
      remboursements: t.remboursements,
      remboursementsNb: t.remboursementsNb,
    },
  };
}

/** Séries mensuelles des graphiques (toujours sur 12 mois ; les mois à venir restent vides, pas à 0). */
export function seriesMensuelles(s: YearlyStats) {
  const fin = dernierMois(s.annee);
  return s.mois.map((r) => ({
    mois: MOIS_COURT[r.mois - 1],
    numero: r.mois,
    app: r.app,
    manual: r.manual,
    ca: r.mois > fin ? null : r.ca,
    reussie: r.total ? Math.round((r.livrees / r.total) * 1000) / 10 : null,
    annulee: r.total ? Math.round((r.annulees / r.total) * 1000) / 10 : null,
    echec: r.total ? Math.round((r.echecs / r.total) * 1000) / 10 : null,
    nouveaux: r.nouveaux,
    recurrents: r.recurrents,
  }));
}

/** Livraisons par chauffeur sur la période, tri décroissant. */
export function parChauffeur(s: YearlyStats, mois: number) {
  const m = new Map<string, { nom: string; livraisons: number }>();
  for (const c of s.chauffeurs) {
    if (mois && c.mois !== mois) continue;
    const k = c.id ?? c.nom;
    const e = m.get(k) ?? { nom: c.nom, livraisons: 0 };
    e.livraisons += c.livraisons;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.livraisons - a.livraisons || a.nom.localeCompare(b.nom));
}

/** Répartition des commandes : par cité, ou par lot quand une cité est filtrée.
 *  Au-delà de 6 parts, le reste est regroupé dans « Autres ». */
export function parZone(s: YearlyStats, mois: number, parLot: boolean) {
  const m = new Map<string, number>();
  for (const z of s.zones) {
    if (mois && z.mois !== mois) continue;
    const k = parLot ? `Lot ${z.lot}` : z.cite_nom;
    m.set(k, (m.get(k) ?? 0) + z.total);
  }
  const tri = [...m.entries()].map(([nom, total]) => ({ nom, total })).sort((a, b) => b.total - a.total);
  const total = tri.reduce((x, z) => x + z.total, 0);
  const tete = tri.slice(0, 6);
  const reste = tri.slice(6).reduce((x, z) => x + z.total, 0);
  const parts = reste ? [...tete, { nom: "Autres", total: reste }] : tete;
  return parts.map((p) => ({ ...p, pct: total ? (p.total / total) * 100 : 0 }));
}

// ─── Formatage ─────────────────────────────────────────────────────────────

export const fmtNombre = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");
export const fmtFcfa = (n: number) => `${fmtNombre(n)} FCFA`;
export const fmtPct = (n: number | null, dec = 1) => (n == null ? "—" : `${n.toFixed(dec).replace(".", ",")} %`);
export function fmtDuree(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// ─── Exports ───────────────────────────────────────────────────────────────

const ENTETES = [
  "Mois",
  "Total commandes",
  "Application",
  "Manuel",
  "% Manuel",
  "Bidons",
  "CA (FCFA)",
  "Clients uniques",
  "Taux réussite (%)",
  "Temps moyen (min)",
  "Remboursements (FCFA)",
  "Nb remboursements",
];

const valeurs = (l: LigneRecap) => [
  l.label,
  l.total,
  l.app,
  l.manual,
  l.manualPct == null ? "" : Math.round(l.manualPct * 10) / 10,
  l.bidons,
  l.ca,
  l.clients,
  l.reussite == null ? "" : Math.round(l.reussite * 10) / 10,
  l.temps ?? "",
  l.remboursements,
  l.remboursementsNb,
];

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV séparé par « ; » avec BOM UTF-8 : s'ouvre correctement dans Excel en français. */
export function exporterCsv(lignes: LigneRecap[], total: LigneRecap, nom: string) {
  const esc = (v: string | number) => {
    const s = String(v).replace(".", ",");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corps = [ENTETES, ...lignes.map(valeurs), valeurs(total)].map((r) => r.map(esc).join(";")).join("\r\n");
  telecharger(new Blob(["﻿" + corps], { type: "text/csv;charset=utf-8" }), `${nom}.csv`);
}

/** Classeur .xlsx : récap mensuel, indicateurs, chauffeurs. Bibliothèque chargée à la demande. */
export async function exporterExcel(
  lignes: LigneRecap[],
  total: LigneRecap,
  kpis: Kpis,
  chauffeurs: { nom: string; livraisons: number }[],
  periode: string,
  nom: string
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const entete = (v: string) => ({ value: v, fontWeight: "bold" as const });
  const cellule = (v: string | number) => (typeof v === "number" ? { value: v, type: Number } : { value: v, type: String });
  const recap = [
    ENTETES.map(entete),
    ...lignes.map((l) => valeurs(l).map(cellule)),
    valeurs(total).map((v) => ({ ...cellule(v), fontWeight: "bold" as const })),
  ];
  const indicateurs: [string, string | number][] = [
    ["Période", periode],
    ["Total commandes", kpis.total],
    ["Variation vs année précédente (%)", kpis.variation == null ? "" : Math.round(kpis.variation * 10) / 10],
    ["Commandes application", kpis.app],
    ["Commandes manuelles", kpis.manual],
    ["Bidons livrés", kpis.bidons],
    ["Chiffre d'affaires (FCFA)", kpis.ca],
    ["Panier moyen (FCFA)", kpis.panierMoyen == null ? "" : Math.round(kpis.panierMoyen)],
    ["Remboursements (FCFA)", kpis.remboursements],
    ["Clients actifs", kpis.clientsActifs],
    ["Nouveaux clients", kpis.nouveaux],
    ["Clients récurrents (> 3 commandes)", kpis.recurrents],
    ["Taux de réussite (%)", kpis.tauxReussite == null ? "" : Math.round(kpis.tauxReussite * 10) / 10],
    ["Temps moyen de livraison (min)", kpis.tempsMoyen ?? ""],
  ];
  const blob = await writeXlsxFile([
    { sheet: "Récap mensuel", data: recap, columns: ENTETES.map((_, i) => ({ width: i === 0 ? 14 : 18 })) },
    { sheet: "Indicateurs", data: [[entete("Indicateur"), entete("Valeur")], ...indicateurs.map(([k, v]) => [cellule(k), cellule(v)])], columns: [{ width: 36 }, { width: 20 }] },
    { sheet: "Chauffeurs", data: [[entete("Chauffeur"), entete("Livraisons")], ...chauffeurs.map((c) => [cellule(c.nom), cellule(c.livraisons)])], columns: [{ width: 24 }, { width: 14 }] },
  ]).toBlob();
  telecharger(blob, `${nom}.xlsx`);
}
