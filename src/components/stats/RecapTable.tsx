"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { fmtDuree, fmtFcfa, fmtNombre, fmtPct, type LigneRecap } from "@/lib/stats";

const PAR_PAGE = 6;

const COLONNES: { label: string; align?: "right" }[] = [
  { label: "Mois" },
  { label: "Total cmd", align: "right" },
  { label: "App", align: "right" },
  { label: "Manuel", align: "right" },
  { label: "% Manuel", align: "right" },
  { label: "Bidons", align: "right" },
  { label: "CA (FCFA)", align: "right" },
  { label: "Clients uniques", align: "right" },
  { label: "Taux réussite", align: "right" },
  { label: "Temps moyen", align: "right" },
  { label: "Remboursements", align: "right" },
];

function cellules(l: LigneRecap): ReactNode[] {
  return [
    l.label,
    fmtNombre(l.total),
    fmtNombre(l.app),
    fmtNombre(l.manual),
    fmtPct(l.manualPct),
    fmtNombre(l.bidons),
    fmtNombre(l.ca),
    fmtNombre(l.clients),
    fmtPct(l.reussite),
    fmtDuree(l.temps),
    l.remboursementsNb ? `${fmtFcfa(l.remboursements)} (${l.remboursementsNb})` : "—",
  ];
}

export default function RecapTable({ lignes, total, actions }: { lignes: LigneRecap[]; total: LigneRecap; actions: ReactNode }) {
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(0);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? lignes.filter((l) => l.label.toLowerCase().includes(q)) : lignes;
  }, [lignes, recherche]);
  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));
  const courante = Math.min(page, pages - 1);
  const visibles = filtrees.slice(courante * PAR_PAGE, (courante + 1) * PAR_PAGE);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Récapitulatif mensuel</h3>
          <p className="mt-0.5 text-xs text-slate-500">La ligne Total compte les clients distincts de la période.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Rechercher un mois</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setPage(0);
              }}
              placeholder="Rechercher un mois"
              className="h-9 w-48 rounded-md border border-slate-200 pl-8 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
          </label>
          {actions}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {COLONNES.map((c) => (
                <th key={c.label} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium text-slate-500 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <tr key={l.mois} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {cellules(l).map((v, i) => (
                  <td key={i} className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${i === 0 ? "text-slate-900" : "text-right text-slate-700"}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLONNES.length} className="px-4 py-8 text-center text-sm text-slate-400">
                  Aucun mois ne correspond à la recherche.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
              {cellules(total).map((v, i) => (
                <td key={i} className={`whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-900 ${i === 0 ? "" : "text-right"}`}>
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
        <span>
          {filtrees.length} mois · page {courante + 1} sur {pages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Page précédente"
            disabled={courante === 0}
            onClick={() => setPage(courante - 1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Page suivante"
            disabled={courante >= pages - 1}
            onClick={() => setPage(courante + 1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
