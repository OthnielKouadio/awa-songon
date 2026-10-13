"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { FILTRES_SOURCE, type FiltreSource, formatFcfa, heure, jour, QUANTITE_L } from "@/lib/format";
import type { AdminData, CommandeStatus } from "@/lib/types";
import { CommandeBadge, SegmentedFilter, SourceBadge, Table, Td, Th } from "../ui";
import { Panel } from "./shared";

const FILTERS: { id: CommandeStatus | ""; label: string }[] = [
  { id: "", label: "Toutes" },
  { id: "ASSIGNED", label: "Dans la file" },
  { id: "QUEUED", label: "En attente (pause)" },
  { id: "PROGRAMMED", label: "Programmées" },
  { id: "EN_COURS", label: "En route" },
  { id: "ARRIVING", label: "Arrivent" },
  { id: "LIVREE", label: "Livrées" },
  { id: "ANNULEE", label: "Annulées" },
];

export default function CommandesPanel({ data }: { data: AdminData }) {
  const [filtre, setFiltre] = useState<CommandeStatus | "">("");
  const [source, setSource] = useState<FiltreSource>("all");
  const citeNom = (id: string) => data.cites.find((c) => c.id === id)?.nom ?? "?";
  const clientNom = (id: string) => data.clients.find((c) => c.id === id)?.nom ?? "Client supprimé";
  const chauffeurNom = (id: string | null) => data.tricycles.find((t) => t.id === id)?.nom ?? "Chauffeur supprimé";

  const parStatut = useMemo(() => data.commandes.filter((c) => !filtre || c.status === filtre), [data.commandes, filtre]);
  const rows = useMemo(() => parStatut.filter((c) => source === "all" || c.source === source).slice(0, 200), [parStatut, source]);

  return (
    <Panel title="Commandes en temps réel">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltre(f.id)}
              className={`rounded-xl border-[1.5px] px-3 py-1.5 text-sm font-bold transition-colors ${
                filtre === f.id ? "border-ink bg-ink text-white" : "border-ink/30 bg-white text-ink/60 hover:border-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <SegmentedFilter
          ariaLabel="Filtrer par origine"
          value={source}
          onChange={setSource}
          options={FILTRES_SOURCE.map((f) => ({ ...f, count: f.id === "all" ? parStatut.length : parStatut.filter((c) => c.source === f.id).length }))}
        />
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Origine</Th>
            <Th>Chauffeur</Th>
            <Th>Cité / Lot</Th>
            <Th>{QUANTITE_L}L</Th>
            <Th>Statut</Th>
            <Th>Livraison</Th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((c) => (
              <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Td>
                  <span className="font-semibold">{clientNom(c.client_id)}</span>
                  {c.source === "manual" && (
                    <span className="block text-xs text-ink/55">
                      Ajouté par {chauffeurNom(c.added_by_driver_id)} à {heure(c.created_at)}
                      {c.is_temporary_client && " · client temporaire"}
                    </span>
                  )}
                </Td>
                <Td>
                  <SourceBadge source={c.source} />
                </Td>
                <Td>{chauffeurNom(c.tricycle_id)}</Td>
                <Td>
                  {citeNom(c.cite_id)} · Lot {c.lot_numero}
                </Td>
                <Td>
                  {formatFcfa(c.prix)}
                  {c.quantite_bidons ? <span className="block text-xs text-ink/55">{c.quantite_bidons} bidons</span> : null}
                </Td>
                <Td>
                  <CommandeBadge status={c.status} />
                </Td>
                <Td>
                  {jour(c.created_at)} · {heure(c.created_at)}
                  {c.scheduled_for !== c.created_at.slice(0, 10) && <span className="block text-xs text-ink/55">prévue le {jour(c.scheduled_for)}</span>}
                </Td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </Table>
      {rows.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucune commande.</p>}
    </Panel>
  );
}
