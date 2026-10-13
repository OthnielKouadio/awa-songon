"use client";

import { useState } from "react";
import { api } from "@/lib/data-provider";
import { enEssai, jour } from "@/lib/format";
import type { AdminData, CompteStatut, Creds } from "@/lib/types";
import { useConfirm } from "../CustomModal";
import { Badge, ErrorBox, StatutBadge, Table, TableBtn, Td, Th } from "../ui";
import { correspond, Panel, RechercheCompte, useCodeProvisoire, useMutation } from "./shared";

export default function ClientsPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, error } = useMutation(reload);
  const { confirm, ConfirmDialog } = useConfirm();
  const pin = useCodeProvisoire(creds, reload);
  const [recherche, setRecherche] = useState("");
  const clients = data.clients.filter((c) => correspond(c, recherche));
  const citeNom = (id: string) => data.cites.find((c) => c.id === id)?.nom ?? "?";

  function setStatut(id: string, statut: CompteStatut) {
    void run(() => api.admin.setStatut(creds, "clients", id, statut));
  }

  async function remove(nom: string, id: string) {
    const ok = await confirm("Son historique de commandes sera supprimé.", {
      title: `Supprimer définitivement le compte de ${nom} ?`,
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    void run(() => api.admin.remove(creds, "clients", id));
  }

  return (
    <Panel title="Clients">
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
            <Th>Lot</Th>
            <Th>Essai</Th>
            <Th>Statut</Th>
            <Th>Dernier paiement</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const nb = data.commandes.filter((cm) => cm.client_id === c.id).length;
            return (
              <tr key={c.id}>
                <Td>
                  <span className="font-bold">{c.nom}</span>
                  {c.is_temporary && (
                    <span className="ml-2 rounded-md border border-ink/25 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
                      Temporaire
                    </span>
                  )}
                  {nb > 0 && (
                    <Badge tone="ink" className="ml-2">
                      {nb} commande{nb > 1 ? "s" : ""}
                    </Badge>
                  )}
                </Td>
                <Td>{c.telephone}</Td>
                <Td>{citeNom(c.cite_id)}</Td>
                <Td>{c.lot_numero}</Td>
                <Td>
                  <EssaiCell fin={c.essai_fin} />
                </Td>
                <Td>
                  <StatutBadge statut={c.statut} />
                </Td>
                <Td>{c.date_paiement ? jour(c.date_paiement) : "—"}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    {c.statut !== "PAYE" && <TableBtn onClick={() => setStatut(c.id, "PAYE")}>Marquer payé</TableBtn>}
                    {c.statut !== "IMPAYE" && <TableBtn onClick={() => setStatut(c.id, "IMPAYE")}>Marquer impayé</TableBtn>}
                    {c.statut === "BLOQUE" ? (
                      <TableBtn tone="azur" onClick={() => setStatut(c.id, "IMPAYE")}>
                        Débloquer
                      </TableBtn>
                    ) : (
                      <TableBtn tone="danger" onClick={() => setStatut(c.id, "BLOQUE")}>
                        Bloquer
                      </TableBtn>
                    )}
                    {!c.is_temporary && <TableBtn onClick={() => void pin.generer("clients", c.id, c.nom)}>Code provisoire</TableBtn>}
                    <TableBtn tone="danger" onClick={() => remove(c.nom, c.id)}>
                      Supprimer
                    </TableBtn>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {data.clients.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucun client inscrit.</p>}
      {data.clients.length > 0 && clients.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucun client ne correspond à « {recherche} ».</p>}
      {ConfirmDialog}
      {pin.dialog}
    </Panel>
  );
}

/** Essai gratuit en cours (avec sa date de fin) ou terminé. */
export function EssaiCell({ fin }: { fin: string | null }) {
  if (!fin) return <>—</>;
  return enEssai(fin) ? <Badge tone="sky">Jusqu&apos;au {jour(fin)}</Badge> : <Badge tone="gray">Terminé</Badge>;
}
