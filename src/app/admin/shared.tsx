"use client";

import type { ReactNode } from "react";
import type { BadgeTone } from "@/components/ui";
import type { Cite, StatutMaison } from "./types";

export const STATUT_TONE: Record<StatutMaison, BadgeTone> = { LIBRE: "gray", OCCUPEE: "green", BLOQUEE: "danger" };
export const STATUT_LABEL: Record<StatutMaison, string> = { LIBRE: "Libre", OCCUPEE: "Occupée", BLOQUEE: "Bloquée" };

export function Chip({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-[1.5px] border-ink px-3 py-1.5 text-sm font-bold transition-colors ${actif ? "bg-ink text-white" : "bg-white hover:bg-sky"}`}
    >
      {children}
    </button>
  );
}

export function ChoixCite({ cites, value, onChange }: { cites: Cite[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {cites.map((c) => (
        <Chip key={c.id} actif={value === c.id} onClick={() => onChange(c.id)}>
          {c.nom} · {c.code_court}
        </Chip>
      ))}
    </div>
  );
}

export function Section({ titre, children, action }: { titre: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label !mb-0">{titre}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
