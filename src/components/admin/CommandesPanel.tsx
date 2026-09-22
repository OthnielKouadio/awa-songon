"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { formatFcfa, heure, jour, QUANTITE_L } from "@/lib/format";
import type { AdminData, CommandeStatus } from "@/lib/types";
import { Badge, Table, Td, Th } from "../ui";
import { Panel } from "./shared";

const FILTERS: { id: CommandeStatus | ""; label: string }[] = [
  { id: "", label: "Toutes" },
  { id: "EN_ATTENTE", label: "En attente" },
  { id: "EN_COURS", label: "En livraison" },
  { id: "LIVRE", label: "Livrées" },
];

export default function CommandesPanel({ data }: { data: AdminData }) {
  const [filtre, setFiltre] = useState<CommandeStatus | "">("");
  const citeNom = (id: string) => data.cites.find((c) => c.id === id)?.nom ?? "?";
  const clientNom = (id: string) => data.clients.find((c) => c.id === id)?.nom ?? "Client supprimé";
  const chauffeurNom = (id: string) => data.tricycles.find((t) => t.id === id)?.nom ?? "Chauffeur supprimé";

  const rows = useMemo(
    () => data.commandes.filter((c) => !filtre || c.status === filtre).slice(0, 200),
    [data.commandes, filtre]
  );

  return (
    <Panel title="Commandes en temps réel">
      <div className="mb-5 flex flex-wrap gap-2">
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

      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Chauffeur</Th>
            <Th>Cité / Lot</Th>
            <Th>{QUANTITE_L}L</Th>
            <Th>Statut</Th>
            <Th>Reçue</Th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((c) => (
              <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Td>{clientNom(c.client_id)}</Td>
                <Td>{chauffeurNom(c.tricycle_id)}</Td>
                <Td>
                  {citeNom(c.cite_id)} · Lot {c.lot_numero}
                </Td>
                <Td>{formatFcfa(c.prix)}</Td>
                <Td>
                  <Badge tone={c.status === "LIVRE" ? "gray" : c.status === "EN_COURS" ? "azur" : "sky"}>{c.status.replace("_", " ")}</Badge>
                </Td>
                <Td>
                  {jour(c.created_at)} · {heure(c.created_at)}
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
