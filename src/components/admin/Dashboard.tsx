"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { formatFcfa, heure } from "@/lib/format";
import type { AdminData, Commande } from "@/lib/types";
import { CustomSelect } from "../CustomSelect";
import MapLazy from "../MapLazy";
import type { MapLine, MapMarker } from "../MapView";
import { Badge, Counter } from "../ui";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export default function AdminDashboard({ data }: { data: AdminData }) {
  const { cites, sources, tricycles, clients, commandes } = data;
  const [filtreCite, setFiltreCite] = useState("");

  const citeNom = (id: string) => cites.find((c) => c.id === id)?.nom ?? "?";
  const citeOk = (citeId: string) => !filtreCite || citeId === filtreCite;

  const kpis = useMemo(() => {
    const duJour = commandes.filter((c) => isToday(c.created_at));
    return {
      clients: clients.length,
      chauffeurs: tricycles.length,
      commandesDuJour: duJour.length,
      caEstime: duJour.reduce((sum, c) => sum + c.prix, 0),
    };
  }, [clients, tricycles, commandes]);

  // ── Carte globale ────────────────────────────────────────────────────────
  const { markers, lines } = useMemo(() => {
    const markers: MapMarker[] = [];
    const lines: MapLine[] = [];

    for (const s of sources) {
      if (s.lat == null || s.long == null || !citeOk(s.cite_id)) continue;
      markers.push({ id: `s-${s.id}`, lat: s.lat, lng: s.long, kind: "source", title: s.nom, lines: [citeNom(s.cite_id)] });
    }

    for (const c of commandes) {
      if (c.status === "LIVRE" || c.lat == null || c.long == null || !citeOk(c.cite_id)) continue;
      markers.push({
        id: `c-${c.id}`,
        lat: c.lat,
        lng: c.long,
        kind: c.status === "EN_COURS" ? "commande-cours" : "commande",
        title: `Lot ${c.lot_numero} · N°${c.position_file}`,
        lines: [`${c.status === "EN_COURS" ? "en livraison" : "en attente"} · ${formatFcfa(c.prix)}`, citeNom(c.cite_id)],
      });
    }

    // Les tricycles n'émettent pas de GPS : position ESTIMÉE
    //  - à la source quand il attend / est à la source
    //  - vers le lot en cours de livraison quand il est parti
    tricycles.forEach((t, i) => {
      const src = sources.find((s) => s.id === t.source_id);
      const citeMatch = !filtreCite || t.cite_ids.includes(filtreCite);
      if (!src || src.lat == null || src.long == null || !citeMatch) return;
      const cible = commandes.find((c) => c.tricycle_id === t.id && c.status === "EN_COURS" && c.lat != null);
      const off = ((i % 5) - 2) * 0.00018;
      let lat = src.lat + 0.0002 + off;
      let lng = src.long + off;
      let etat = "à la source";
      if (t.etat === "EN_ROUTE" && cible) {
        lat = cible.lat! + 0.00015;
        lng = cible.long! + 0.00015;
        etat = `vers le lot ${cible.lot_numero}`;
        lines.push({ id: `l-${t.id}`, from: [src.lat, src.long], to: [cible.lat!, cible.long!] });
      } else if (t.etat === "EN_ROUTE") etat = "en route";
      markers.push({
        id: `t-${t.id}`,
        lat,
        lng,
        kind: t.status === "DISPO" ? "tricycle" : "tricycle-off",
        title: t.nom,
        lines: [t.status, t.statut !== "PAYE" ? t.statut : "", etat, "Position estimée"],
      });
    });

    return { markers, lines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, tricycles, commandes, filtreCite]);

  const recentes = commandes.filter((c) => citeOk(c.cite_id)).slice(0, 30);
  const tricycleNom = (id: string) => tricycles.find((t) => t.id === id)?.nom ?? "?";
  const clientNom = (id: string) => clients.find((c) => c.id === id)?.nom ?? "Client supprimé";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Clients" value={kpis.clients} primary />
        <Kpi label="Chauffeurs" value={kpis.chauffeurs} />
        <Kpi label="Commandes aujourd'hui" value={kpis.commandesDuJour} />
        <Kpi label="CA estimé aujourd'hui" value={kpis.caEstime} format={formatFcfa} />
      </div>

      <section className="brut p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="title-md">Carte globale</h2>
          <div className="w-full max-w-[220px]">
            <CustomSelect
              ariaLabel="Filtrer par cité"
              value={filtreCite}
              onChange={setFiltreCite}
              placeholder="Toutes les cités"
              options={cites.map((c) => ({ value: c.id, label: c.nom }))}
            />
          </div>
        </div>
        <MapLazy height={440} markers={markers} lines={lines} fitKey={`${filtreCite}:${markers.length ? "ok" : "vide"}`} />
        <p className="mt-3 text-xs font-medium text-ink/55">
          Bleu foncé : forage · Bleu : chauffeur DISPO (gris : OFF, position estimée) · Pin blanc : commande en attente · Pin bleu : en livraison.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="brut p-5 sm:p-6">
          <h2 className="title-md mb-4">Chauffeurs</h2>
          <ul className="space-y-2">
            {tricycles
              .filter((t) => !filtreCite || t.cite_ids.includes(filtreCite))
              .map((t) => {
                const src = sources.find((s) => s.id === t.source_id);
                const citesTxt = t.cite_ids.map(citeNom).join(", ");
                const file = commandes.filter((c) => c.tricycle_id === t.id && c.status !== "LIVRE").length;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border-[1.5px] border-ink bg-white px-3 py-2.5">
                    <span className="min-w-0 truncate font-bold">
                      {t.nom}
                      <span className="ml-2 text-sm font-medium text-ink/55">{src ? `${citesTxt} · ${src.nom}` : citesTxt}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {file > 0 && <Badge tone="ink">{file} en file</Badge>}
                      <Badge tone={t.status === "DISPO" ? "azur" : "gray"}>{t.status}</Badge>
                    </span>
                  </li>
                );
              })}
            {tricycles.length === 0 && <p className="font-semibold text-ink/60">Aucun chauffeur.</p>}
          </ul>
        </section>

        <section className="brut p-5 sm:p-6">
          <h2 className="title-md mb-4">Dernières commandes</h2>
          <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {recentes.map((c) => (
                <motion.li key={c.id} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border-[1.5px] border-ink bg-white px-3 py-2.5">
                  <CommandeLine c={c} cite={citeNom(c.cite_id)} chauffeur={tricycleNom(c.tricycle_id)} client={clientNom(c.client_id)} />
                </motion.li>
              ))}
            </AnimatePresence>
            {recentes.length === 0 && <p className="font-semibold text-ink/60">Aucune commande.</p>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function CommandeLine({ c, cite, chauffeur, client }: { c: Commande; cite: string; chauffeur: string; client: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">
          Lot {c.lot_numero} · {formatFcfa(c.prix)} {c.lat != null && <span className="text-azur">· GPS</span>}
        </span>
        <Badge tone={c.status === "LIVRE" ? "gray" : c.status === "EN_COURS" ? "azur" : "sky"}>{c.status.replace("_", " ")}</Badge>
      </div>
      <p className="text-sm text-ink/55">
        {cite} · {client} → {chauffeur} · {heure(c.created_at)}
      </p>
    </>
  );
}

function Kpi({ label, value, primary = false, format }: { label: string; value: number; primary?: boolean; format?: (n: number) => string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 26 }} className={`brut p-4 ${primary ? "!bg-azur text-white" : ""}`}>
      <p className="font-display text-4xl font-bold leading-none sm:text-5xl">
        <Counter value={value} format={format} />
      </p>
      <p className={`mt-2 text-xs font-bold uppercase tracking-wide ${primary ? "text-white/85" : "text-ink/60"}`}>{label}</p>
    </motion.div>
  );
}
