"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useMemo, useState } from "react";
import { api } from "@/lib/data-provider";
import { CHAUFFEUR_STATUS_LABEL, COMMANDES_ACTIVES, formatFcfa, heure, QUANTITE_L } from "@/lib/format";
import type { AdminData, CompteStatut, Creds } from "@/lib/types";
import { useConfirm } from "../CustomModal";
import { Icon } from "../icons";
import { Badge, CommandeBadge, ErrorBox, SourceBadge, StatutBadge, Table, TableBtn, Td, Th } from "../ui";
import { EssaiCell } from "./ClientsPanel";
import { correspond, Panel, RechercheCompte, useCodeProvisoire, useMutation, usePagination } from "./shared";

export default function ChauffeursPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, error } = useMutation(reload);
  const { confirm, ConfirmDialog } = useConfirm();
  const [expanded, setExpanded] = useState<string | null>(null);
  const pin = useCodeProvisoire(creds, reload);
  const [recherche, setRecherche] = useState("");
  // Chauffeurs à valider en premier : ils attendent une décision de l'admin.
  const tricycles = data.tricycles.filter((t) => correspond(t, recherche)).sort((a, b) => Number(a.valide) - Number(b.valide));
  const enAttente = data.tricycles.filter((t) => !t.valide).length;
  const { visibles, suite } = usePagination(tricycles, recherche);
  // Commandes groupées par chauffeur en un seul passage.
  const commandesPar = useMemo(() => {
    const m = new Map<string, AdminData["commandes"]>();
    for (const c of data.commandes) {
      const l = m.get(c.tricycle_id);
      if (l) l.push(c);
      else m.set(c.tricycle_id, [c]);
    }
    return m;
  }, [data.commandes]);
  const citeNom = (id: string) => data.cites.find((c) => c.id === id)?.nom ?? "?";
  const sourceLabel = (id: string | null) => (id && data.sources.find((x) => x.id === id)?.nom) || "—";

  function setStatut(id: string, statut: CompteStatut) {
    void run(() => api.admin.setStatut(creds, "tricycles", id, statut));
  }

  async function valider(nom: string, id: string) {
    const ok = await confirm("Il deviendra visible des clients de sa cité et pourra recevoir des commandes.", {
      title: `Valider le compte de ${nom} ?`,
      confirmLabel: "Valider",
    });
    if (!ok) return;
    void run(() => api.admin.validerChauffeur(creds, id));
  }

  async function remove(nom: string, id: string) {
    const ok = await confirm("Ses commandes (historique compris) seront supprimées.", {
      title: `Supprimer définitivement le compte de ${nom} ?`,
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    void run(() => api.admin.remove(creds, "tricycles", id));
  }

  return (
    <Panel title="Chauffeurs">
      {enAttente > 0 && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border-brut border-ink bg-sky px-4 py-2.5 text-sm font-bold">
          <Icon name="alert" size={16} className="text-azur" />
          {enAttente} chauffeur{enAttente > 1 ? "s" : ""} en attente de validation : vérifie son identité (appel, pièce, tricycle) avant de valider.
        </p>
      )}
      <RechercheCompte value={recherche} onChange={setRecherche} />
      {(error || pin.error) && (
        <div className="mb-4">
          <ErrorBox>{error || pin.error}</ErrorBox>
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <Th>Nom</Th>
            <Th>Téléphone</Th>
            <Th>Cité</Th>
            <Th>Source</Th>
            <Th>Prix {QUANTITE_L}L</Th>
            <Th>Dispo</Th>
            <Th>Essai</Th>
            <Th>Statut</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((t) => {
            const commandes = commandesPar.get(t.id) ?? [];
            const enCours = commandes.filter((c) => COMMANDES_ACTIVES.includes(c.status)).length;
            return (
              <Fragment key={t.id}>
                <tr>
                  <Td>
                    <span className="font-bold">{t.nom}</span>
                    {!t.valide && (
                      <Badge tone="danger" className="ml-2">
                        À valider
                      </Badge>
                    )}
                    {enCours > 0 && (
                      <Badge tone="ink" className="ml-2">
                        {enCours} en file
                      </Badge>
                    )}
                  </Td>
                  <Td>{t.telephone}</Td>
                  <Td>{citeNom(t.cite_id)}</Td>
                  <Td>{sourceLabel(t.source_id)}</Td>
                  <Td>{formatFcfa(t.prix_1000)}</Td>
                  <Td>
                    <Badge tone={t.status === "ACTIVE" ? "azur" : "gray"}>{CHAUFFEUR_STATUS_LABEL[t.status]}</Badge>
                  </Td>
                  <Td>
                    <EssaiCell fin={t.essai_fin} />
                  </Td>
                  <Td>
                    <StatutBadge statut={t.statut} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {!t.valide && (
                        <TableBtn tone="azur" onClick={() => void valider(t.nom, t.id)}>
                          Valider
                        </TableBtn>
                      )}
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
                      <TableBtn onClick={() => void pin.generer("tricycles", t.id, t.nom)}>Code provisoire</TableBtn>
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
                    <td colSpan={9} className="border-b border-ink/10 bg-mist px-4 py-3">
                      <CommandesInline commandes={commandes} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
      {suite}
      {data.tricycles.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucun chauffeur inscrit.</p>}
      {data.tricycles.length > 0 && tricycles.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucun chauffeur ne correspond à « {recherche} ».</p>}
      {ConfirmDialog}
      {pin.dialog}
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
              <span className="flex items-center gap-1.5">
                <SourceBadge source={c.source} />
                <CommandeBadge status={c.status} />
              </span>
            </motion.li>
          ))}
      </AnimatePresence>
    </ul>
  );
}
