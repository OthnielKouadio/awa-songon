"use client";

import { api } from "@/lib/api";
import { daysLeft, jour } from "@/lib/format";
import type { AdminData, CompteStatut, Creds } from "@/lib/types";
import { useConfirm } from "../CustomModal";
import { Badge, ErrorBox, StatutBadge, Table, TableBtn, Td, Th } from "../ui";
import { Panel, useMutation } from "./shared";

export default function ClientsPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, error } = useMutation(reload);
  const { confirm, ConfirmDialog } = useConfirm();
  const citeNom = (id: string) => data.cites.find((c) => c.id === id)?.nom ?? "?";

  function setStatut(id: string, statut: CompteStatut) {
    void run(() => api.admin.setStatut(creds, "clients", id, statut));
  }

  function prolonger(id: string) {
    void run(() => api.admin.prolongerAbonnement(creds, id));
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
            <Th>Cité</Th>
            <Th>Lot</Th>
            <Th>Statut</Th>
            <Th>Dernier paiement</Th>
            <Th>Expire le</Th>
            <Th>Jours restants</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {data.clients.map((c) => {
            const nb = data.commandes.filter((cm) => cm.client_id === c.id).length;
            const days = daysLeft(c.subscription_ends_at);
            const expired = days <= 0;
            return (
              <tr key={c.id}>
                <Td>
                  <span className="font-bold">{c.nom}</span>
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
                  <StatutBadge statut={c.statut} />
                </Td>
                <Td>{c.date_paiement ? jour(c.date_paiement) : "—"}</Td>
                <Td>{jour(c.subscription_ends_at)}</Td>
                <Td>
                  <span
                    className={`font-bold ${expired ? "text-danger" : days <= 3 ? "text-orange-600" : "text-ink"}`}
                  >
                    {expired ? "Expiré" : `${days} j`}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    <TableBtn tone="azur" onClick={() => prolonger(c.id)}>
                      +30 jours
                    </TableBtn>
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
      {ConfirmDialog}
    </Panel>
  );
}
