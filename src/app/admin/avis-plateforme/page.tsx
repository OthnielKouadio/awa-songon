"use client";

import { ErrorBox, Spinner, Stars } from "@/components/ui";
import { dateHeure } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type Donnees = {
  moyenne: number | null;
  total: number;
  repartition: Record<string, number>;
  avis: { id: string; note: number; commentaire: string | null; created_at: string; code_affichage: string; nom_famille: string; auteur: string | null }[];
};

export default function AvisPlateformePage() {
  const { data, err, chargement } = useRpc<Donnees>("admin_avis_plateforme", undefined, "avis");
  const max = Math.max(1, ...Object.values(data?.repartition ?? {}));

  return (
    <div className="space-y-6">
      <h1 className="title-lg">Avis sur la plateforme</h1>
      {err && <ErrorBox>{err}</ErrorBox>}
      {chargement && !data && <Spinner />}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-[auto,1fr]">
            <div className="rounded-brut border-brut border-ink bg-white p-5 text-center shadow-hard-sm">
              <p className="font-display text-5xl font-bold">{data.moyenne !== null ? Number(data.moyenne).toFixed(1) : "–"}</p>
              <div className="mt-2 flex justify-center">
                <Stars value={Math.round(Number(data.moyenne ?? 0))} size={24} />
              </div>
              <p className="mt-1 text-sm font-semibold text-ink/60">
                {data.total} avis
              </p>
            </div>
            <div className="space-y-1.5 rounded-brut border-brut border-ink bg-white p-5">
              {[5, 4, 3, 2, 1].map((n) => {
                const v = data.repartition[String(n)] ?? 0;
                return (
                  <div key={n} className="flex items-center gap-3 text-sm font-bold">
                    <span className="w-6 text-right">{n}★</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-mist">
                      <div className={`h-full rounded-full ${n < 3 ? "bg-danger" : "bg-azur"}`} style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                    <span className="w-8 text-ink/60">{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {data.avis.length === 0 && <p className="font-semibold text-ink/50">Aucun avis pour l&apos;instant.</p>}
          <ul className="space-y-2">
            {data.avis.map((a) => (
              <li key={a.id} className={`rounded-2xl border-brut bg-white p-4 ${a.note < 3 ? "border-danger" : "border-ink"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars value={a.note} size={20} />
                  <span className="text-sm text-ink/55">{dateHeure(a.created_at)}</span>
                </div>
                {a.commentaire && <p className="mt-2 whitespace-pre-line">{a.commentaire}</p>}
                <p className="mt-2 text-sm font-semibold text-ink/60">
                  {a.code_affichage} · {a.nom_famille}
                  {a.auteur ? ` (${a.auteur})` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
