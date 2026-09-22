"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import { formatFcfa, heure, QUANTITE_L } from "@/lib/format";
import type { AdminData, CompteStatut, Creds } from "@/lib/types";
import { Icon } from "../icons";
import { Badge, ErrorBox, StatutBadge, Table, TableBtn, Td, Th } from "../ui";
import { Panel, useMutation } from "./shared";

export default function ChauffeursPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, error } = useMutation(reload);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sourceLabel = (id: string) => {
    const s = data.sources.find((x) => x.id === id);
    return s ? `${data.cites.find((c) => c.id === s.cite_id)?.nom ?? "?"} · ${s.nom}` : "?";
  };

  function setStatut(id: string, statut: CompteStatut) {
    void run(() => api.admin.setStatut(creds, "tricycles", id, statut));
  }

  function remove(nom: string, id: string) {
    if (!confirm(`Supprimer définitivement le compte de ${nom} ?\n\nSes commandes (historique compris) seront supprimées.`)) return;
    void run(() => api.admin.remove(creds, "tricycles", id));
  }

  return (
    <Panel title="Chauffeurs">
      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <Th>Nom</Th>
            <Th>Téléphone</Th>
            <Th>Source</Th>
            <Th>Prix {QUANTITE_L}L</Th>
            <Th>Dispo</Th>
            <Th>Statut</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {data.tricycles.map((t) => {
            const commandes = data.commandes.filter((c) => c.tricycle_id === t.id);
            const enCours = commandes.filter((c) => c.status !== "LIVRE").length;
            return (
              <Fragment key={t.id}>
                <tr>
                  <Td>
                    <span className="font-bold">{t.nom}</span>
                    {enCours > 0 && (
                      <Badge tone="ink" className="ml-2">
                        {enCours} en file
                      </Badge>
                    )}
                  </Td>
                  <Td>{t.telephone}</Td>
                  <Td>{sourceLabel(t.source_id)}</Td>
                  <Td>{formatFcfa(t.prix_1000)}</Td>
                  <Td>
                    <Badge tone={t.status === "DISPO" ? "azur" : "gray"}>{t.status}</Badge>
                  </Td>
                  <Td>
                    <StatutBadge statut={t.statut} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {t.statut !== "PAYE" && <TableBtn onClick={() => setStatut(t.id, "PAYE")}>Marquer payé</TableBtn>}
                      {t.statut !== "IMPAYE" && <TableBtn onClick={() => setStatut(t.id, "IMPAYE")}>Marquer impayé</TableBtn>}
                      {t.statut === "BLOQUE" ? (
                        <TableBtn tone="azur" onClick={() => setStatut(t.id, "IMPAYE")}>
                          Débloquer
                        </TableBtn>
                      ) : (
                        <TableBtn tone="danger" onClick={() => setStatut(t.id, "BLOQUE")}>
                          Bloquer
                        </TableBtn>
                      )}
                      <TableBtn onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                        <Icon name="eye" size={13} /> Commandes
                      </TableBtn>
                      <TableBtn tone="danger" onClick={() => remove(t.nom, t.id)}>
                        <Icon name="trash" size={13} />
                      </TableBtn>
                    </div>
                  </Td>
                </tr>
                {expanded === t.id && (
                  <tr>
                    <td colSpan={7} className="border-b border-ink/10 bg-mist px-4 py-3">
                      <CommandesInline commandes={commandes} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
      {data.tricycles.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucun chauffeur inscrit.</p>}
    </Panel>
  );
}

function CommandesInline({ commandes }: { commandes: AdminData["commandes"] }) {
  if (commandes.length === 0) return <p className="py-2 text-sm font-medium text-ink/55">Aucune commande.</p>;
  return (
    <ul className="space-y-1.5 py-2">
      <AnimatePresence initial={false}>
        {commandes
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 10)
          .map((c) => (
            <motion.li key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">
                Lot {c.lot_numero} · {formatFcfa(c.prix)}
              </span>
              <span className="text-ink/55">{heure(c.created_at)}</span>
              <Badge tone={c.status === "LIVRE" ? "gray" : c.status === "EN_COURS" ? "azur" : "sky"}>{c.status.replace("_", " ")}</Badge>
            </motion.li>
          ))}
      </AnimatePresence>
    </ul>
  );
}
