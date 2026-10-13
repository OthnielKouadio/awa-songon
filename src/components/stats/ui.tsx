"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Couleurs des graphiques (palette catégorielle validée CVD sur fond blanc + statuts). */
export const COULEURS = {
  serie: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  autres: "#a8a8a3",
  reussie: "#0ca30c",
  annulee: "#ec835a",
  echec: "#d03b3b",
  grille: "#e5e7eb",
  axe: "#94a3b8",
  texte: "#64748b",
};

/** Menu déroulant sobre (jamais de <select> natif dans l'appli). */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const courant = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const dehors = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <span className="truncate">{courant?.label ?? "—"}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[10rem] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={14} className="shrink-0 text-slate-900" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function KpiCard({ titre, valeur, detail, icon: IconCmp }: { titre: string; valeur: string; detail?: ReactNode; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{titre}</p>
        <IconCmp size={16} className="shrink-0 text-slate-400" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{valeur}</p>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-3.5 w-28 rounded bg-slate-100" />
      <div className="mt-3 h-7 w-24 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-36 rounded bg-slate-100" />
    </div>
  );
}

export function ChartCard({
  titre,
  sousTitre,
  vide,
  hauteur = 280,
  children,
}: {
  titre: string;
  sousTitre?: string;
  vide: boolean;
  hauteur?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{titre}</h3>
      {sousTitre && <p className="mt-0.5 text-xs text-slate-500">{sousTitre}</p>}
      <div className="mt-4" style={{ height: hauteur }}>
        {vide ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400">
            Pas de données pour cette période
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function ChartSkeleton({ hauteur = 280 }: { hauteur?: number }) {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-3.5 w-40 rounded bg-slate-100" />
      <div className="mt-4 rounded bg-slate-50" style={{ height: hauteur }} />
    </div>
  );
}

/** Infobulle commune : texte en encre, la couleur de série n'apparaît que dans la pastille. */
export function TooltipBox({
  titre,
  lignes,
}: {
  titre: string;
  lignes: { couleur: string; label: string; valeur: string }[];
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-900">{titre}</p>
      {lignes.map((l) => (
        <p key={l.label} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.couleur }} aria-hidden />
          <span>{l.label}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-900">{l.valeur}</span>
        </p>
      ))}
    </div>
  );
}
