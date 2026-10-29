"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon } from "@/components/icons";
import { Btn, ErrorBox, Spinner } from "@/components/ui";
import { cellule, telechargerCsv } from "@/lib/csv";
import { fcfa } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";
import { Chip } from "../shared";

type Mois = {
  mois: number;
  total: number;
  app: number;
  manual: number;
  livrees: number;
  annulees: number;
  echecs: number;
  ca: number;
  ca_brut: number;
  bonus: number;
  eau: number;
  clients_uniques: number;
  nouveaux: number;
  recurrents: number;
  clients_plus_3: number;
  temps_moyen_min: number | null;
  remboursements_montant: number;
  remboursements_nb: number;
  total_annee_precedente: number;
};
type Stats = {
  annee: number;
  mois: Mois[];
  synthese: { clients_actifs: number; nouveaux: number; clients_plus_3: number; temps_moyen_min: number | null; recharges: number };
  livreurs: { id: string; nom: string; mois: number; livraisons: number }[];
  cites: { cite_id: string; cite: string; mois: number; total: number }[];
  options: { cites: { id: string; nom: string }[]; livreurs: { id: string; nom: string; cite_id: string }[] };
};

const NOMS_MOIS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const COLONNES: [keyof Mois, string][] = [
  ["total", "Commandes"],
  ["app", "Application"],
  ["manual", "Saisie directe"],
  ["livrees", "Livrées"],
  ["annulees", "Annulées"],
  ["echecs", "Échecs"],
  ["eau", "Eau livrée (FCFA)"],
  ["ca", "CA appli net (FCFA)"],
  ["bonus", "Livraisons offertes"],
  ["clients_uniques", "Clients"],
  ["nouveaux", "Nouveaux"],
  ["remboursements_montant", "Recrédits (pts)"],
];

/** Statistiques annuelles (V2) : une seule requête (admin_stats_annuelles). */
export default function StatistiquesPage() {
  const anneeCourante = new Date().getFullYear();
  const [annee, setAnnee] = useState(anneeCourante);
  const [mois, setMois] = useState<number | null>(null);
  const [cite, setCite] = useState<string | null>(null);
  const [livreur, setLivreur] = useState<string | null>(null);
  const args = { p_annee: annee, p_cite: cite, p_livreur: livreur };
  const { data, err, chargement } = useRpc<Stats>("admin_stats_annuelles", args, JSON.stringify(args));

  const lignes = useMemo(() => (data ? data.mois.filter((m) => mois === null || m.mois === mois) : []), [data, mois]);
  const total = useMemo(() => {
    const t = { mois: 0 } as Mois;
    for (const [k] of COLONNES) (t[k] as number) = lignes.reduce((s, l) => s + Number(l[k] ?? 0), 0);
    return t;
  }, [lignes]);

  if (chargement && !data) return <Spinner />;
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!data) return null;

  const precedente = lignes.reduce((s, l) => s + l.total_annee_precedente, 0);
  const variation = precedente > 0 ? ((total.total - precedente) / precedente) * 100 : null;
  const reussite = total.total > 0 ? (total.livrees / total.total) * 100 : null;
  const parLivreur = Object.values(
    data.livreurs.filter((l) => mois === null || l.mois === mois).reduce<Record<string, { nom: string; livraisons: number }>>((acc, l) => {
      acc[l.id] = { nom: l.nom, livraisons: (acc[l.id]?.livraisons ?? 0) + l.livraisons };
      return acc;
    }, {})
  ).sort((a, b) => b.livraisons - a.livraisons);
  const graph = data.mois.map((m) => ({ ...m, nom: NOMS_MOIS[m.mois - 1] }));
  const periode = `${mois ? NOMS_MOIS[mois - 1] + " " : ""}${annee}`;
  const nomFichier = `statistiques-${annee}${mois ? "-" + String(mois).padStart(2, "0") : ""}`;

  const exporterCsv = () => {
    const entete = ["Mois", ...COLONNES.map(([, l]) => l)];
    const rows = lignes.map((l) => [NOMS_MOIS[l.mois - 1], ...COLONNES.map(([k]) => Number(l[k] ?? 0))]);
    rows.push(["Total", ...COLONNES.map(([k]) => Number(total[k] ?? 0))]);
    // Séparateur « ; » : Excel français l'ouvre directement en colonnes.
    telechargerCsv(`${nomFichier}.csv`, [entete, ...rows].map((r) => r.map(cellule).join(";")).join("\r\n") + "\r\n");
  };

  const exporterExcel = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const entete = (v: string) => ({ value: v, fontWeight: "bold" as const });
    const c = (v: string | number) => (typeof v === "number" ? { value: v, type: Number } : { value: v, type: String });
    const recap = [
      ["Mois", ...COLONNES.map(([, l]) => l)].map(entete),
      ...lignes.map((l) => [c(NOMS_MOIS[l.mois - 1]), ...COLONNES.map(([k]) => c(Number(l[k] ?? 0)))]),
      [c("Total"), ...COLONNES.map(([k]) => ({ ...c(Number(total[k] ?? 0)), fontWeight: "bold" as const }))],
    ];
    const indicateurs: [string, string | number][] = [
      ["Période", periode],
      ["Commandes", total.total],
      ["Variation vs année précédente (%)", variation === null ? "" : Math.round(variation * 10) / 10],
      ["Livrées", total.livrees],
      ["Taux de réussite (%)", reussite === null ? "" : Math.round(reussite * 10) / 10],
      ["Valeur de l'eau livrée (FCFA)", total.eau],
      ["CA appli net (FCFA)", total.ca],
      ["Recharges de l'année (points)", data.synthese.recharges],
      ["Clients actifs", data.synthese.clients_actifs],
      ["Nouveaux clients", data.synthese.nouveaux],
      ["Clients fidèles (> 3 commandes)", data.synthese.clients_plus_3],
      ["Temps moyen de livraison (min)", data.synthese.temps_moyen_min ?? ""],
    ];
    const blob = await writeXlsxFile([
      { sheet: "Récap mensuel", data: recap, columns: [{ width: 14 }, ...COLONNES.map(() => ({ width: 18 }))] },
      { sheet: "Indicateurs", data: [[entete("Indicateur"), entete("Valeur")], ...indicateurs.map(([k, v]) => [c(k), c(v)])], columns: [{ width: 36 }, { width: 20 }] },
      { sheet: "Livreurs", data: [[entete("Livreur"), entete("Livraisons")], ...parLivreur.map((l) => [c(l.nom), c(l.livraisons)])], columns: [{ width: 24 }, { width: 14 }] },
    ]).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomFichier}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="title-lg">Statistiques</h1>
        <div className="flex gap-2">
          <Btn variant="white" onClick={exporterCsv}>
            <Icon name="download" size={18} /> CSV
          </Btn>
          <Btn variant="white" onClick={() => void exporterExcel()}>
            <Icon name="download" size={18} /> Excel
          </Btn>
        </div>
      </div>

      {/* Filtres */}
      <div className="sticky top-[118px] z-40 space-y-2 rounded-brut border-brut border-ink bg-white/95 p-3 backdrop-blur">
        <div className="flex flex-wrap gap-1.5">
          {[anneeCourante - 2, anneeCourante - 1, anneeCourante].map((a) => (
            <Chip key={a} actif={annee === a} onClick={() => setAnnee(a)}>
              {a}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-ink/20" />
          <Chip actif={mois === null} onClick={() => setMois(null)}>
            Toute l&apos;année
          </Chip>
          {NOMS_MOIS.map((n, i) => (
            <Chip key={n} actif={mois === i + 1} onClick={() => setMois(i + 1)}>
              {n}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip actif={cite === null} onClick={() => { setCite(null); setLivreur(null); }}>
            Toutes les cités
          </Chip>
          {data.options.cites.map((c) => (
            <Chip key={c.id} actif={cite === c.id} onClick={() => { setCite(c.id); setLivreur(null); }}>
              {c.nom}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-ink/20" />
          <Chip actif={livreur === null} onClick={() => setLivreur(null)}>
            Tous les livreurs
          </Chip>
          {data.options.livreurs
            .filter((l) => !cite || l.cite_id === cite)
            .map((l) => (
              <Chip key={l.id} actif={livreur === l.id} onClick={() => setLivreur(l.id)}>
                {l.nom}
              </Chip>
            ))}
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Commandes" v={String(total.total)} sous={variation === null ? undefined : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)} % vs ${annee - 1}`} />
        <Kpi k="Livrées" v={String(total.livrees)} sous={reussite === null ? undefined : `${reussite.toFixed(0)} % de réussite`} />
        <Kpi k="Eau livrée" v={fcfa(total.eau)} />
        <Kpi k="CA appli net" v={fcfa(total.ca)} sous={total.bonus ? `${total.bonus} livraison(s) offerte(s)` : undefined} />
        <Kpi k="Application / directe" v={`${total.app} / ${total.manual}`} />
        <Kpi k="Annulées / échecs" v={`${total.annulees} / ${total.echecs}`} />
        <Kpi k="Clients actifs" v={String(data.synthese.clients_actifs)} sous={`${data.synthese.nouveaux} nouveaux · ${data.synthese.clients_plus_3} fidèles`} />
        <Kpi k="Temps moyen" v={data.synthese.temps_moyen_min !== null ? `${data.synthese.temps_moyen_min} min` : "–"} sous="commande → livrée" />
      </div>

      {/* Graphiques */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Graph titre="Commandes par mois">
          <BarChart data={graph}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0A193120" />
            <XAxis dataKey="nom" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Legend />
            <Bar dataKey="app" name="Application" stackId="a" fill="#0096FF" />
            <Bar dataKey="manual" name="Saisie directe" stackId="a" fill="#F28C28" />
          </BarChart>
        </Graph>
        <Graph titre={`Comparaison ${annee - 1} / ${annee}`}>
          <LineChart data={graph}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0A193120" />
            <XAxis dataKey="nom" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Legend />
            <Line dataKey="total_annee_precedente" name={String(annee - 1)} stroke="#C9D5E3" strokeWidth={3} dot={false} />
            <Line dataKey="total" name={String(annee)} stroke="#0A1931" strokeWidth={3} />
          </LineChart>
        </Graph>
        <Graph titre="Valeur de l'eau livrée (FCFA)">
          <BarChart data={graph}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0A193120" />
            <XAxis dataKey="nom" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v) => fcfa(Number(v))} />
            <Bar dataKey="eau" name="Eau livrée" fill="#1FA35B" />
          </BarChart>
        </Graph>
        <Graph titre="Clients">
          <BarChart data={graph}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0A193120" />
            <XAxis dataKey="nom" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Legend />
            <Bar dataKey="nouveaux" name="Nouveaux" stackId="c" fill="#0096FF" />
            <Bar dataKey="recurrents" name="Récurrents" stackId="c" fill="#0A1931" />
          </BarChart>
        </Graph>
      </div>

      {/* Récap mensuel */}
      <section>
        <h2 className="title-md mb-3">Récapitulatif {periode}</h2>
        <div className="overflow-x-auto rounded-2xl border-brut border-ink bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-b-2 border-ink bg-mist px-3 py-2 text-xs font-bold uppercase">Mois</th>
                {COLONNES.map(([, l]) => (
                  <th key={l} className="border-b-2 border-ink bg-mist px-3 py-2 text-right text-xs font-bold uppercase">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.mois} className="border-b border-ink/10">
                  <td className="px-3 py-2 font-bold">{NOMS_MOIS[l.mois - 1]}</td>
                  {COLONNES.map(([k]) => (
                    <td key={k} className="px-3 py-2 text-right tabular-nums">
                      {Number(l[k] ?? 0).toLocaleString("fr-FR")}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-sky font-bold">
                <td className="px-3 py-2">Total</td>
                {COLONNES.map(([k]) => (
                  <td key={k} className="px-3 py-2 text-right tabular-nums">
                    {Number(total[k] ?? 0).toLocaleString("fr-FR")}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {parLivreur.length > 0 && (
        <section>
          <h2 className="title-md mb-3">Livraisons par livreur</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parLivreur.map((l) => (
              <li key={l.nom} className="flex justify-between rounded-2xl border-brut border-ink bg-white px-4 py-3 font-bold">
                <span>{l.nom}</span>
                <span>{l.livraisons}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ k, v, sous }: { k: string; v: string; sous?: string }) {
  return (
    <div className="rounded-brut border-brut border-ink bg-white p-4 shadow-hard-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/55">{k}</p>
      <p className="mt-1 font-display text-2xl font-bold">{v}</p>
      {sous && <p className="text-xs font-semibold text-ink/55">{sous}</p>}
    </div>
  );
}

function Graph({ titre, children }: { titre: string; children: React.ReactElement }) {
  return (
    <div className="rounded-brut border-brut border-ink bg-white p-4">
      <p className="mb-2 font-bold">{titre}</p>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
