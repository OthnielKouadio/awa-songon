"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatPoints, onlyDigits, RECHARGE_MULTIPLE, SOLDE_MIN } from "@/lib/format";
import type { AdminData, Creds } from "@/lib/types";
import { Badge, ErrorBox, Table, TableBtn, Td, Th } from "../ui";
import { Panel, useMutation } from "./shared";

export default function RechargesPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, error, setError } = useMutation(reload);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  function recharger(id: string) {
    const montant = Number(inputs[id]);
    if (!Number.isFinite(montant) || montant <= 0) return setError("Entre un montant.");
    if (montant % RECHARGE_MULTIPLE !== 0) return setError(`Le montant doit être un multiple de ${RECHARGE_MULTIPLE}.`);
    void run(() => api.admin.rechargerPoints(creds, id, montant)).then((ok) => {
      if (ok) setInputs((s) => ({ ...s, [id]: "" }));
    });
  }

  return (
    <Panel title="Recharges de points">
      <p className="mb-5 max-w-2xl text-sm font-medium text-ink/60">
        1 FCFA = 1 point. Un chauffeur qui passe sous {formatPoints(SOLDE_MIN)} n&apos;est plus visible des clients. Recharge ici après
        réception d&apos;un paiement Wave — le montant doit être un multiple de {RECHARGE_MULTIPLE}.
      </p>
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
            <Th>Solde</Th>
            <Th>Recharger</Th>
          </tr>
        </thead>
        <tbody>
          {data.tricycles.map((t) => {
            const faible = t.solde_points < SOLDE_MIN;
            return (
              <tr key={t.id}>
                <Td>
                  <span className="font-bold">{t.nom}</span>
                </Td>
                <Td>{t.telephone}</Td>
                <Td>
                  <Badge tone={faible ? "danger" : "sky"}>
                    {formatPoints(t.solde_points)}
                    {t.is_offline && " · hors ligne"}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <input
                      className="field !w-28 !py-2 text-sm"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="1000"
                      aria-label={`Montant à ajouter pour ${t.nom}`}
                      value={inputs[t.id] ?? ""}
                      onChange={(e) => setInputs((s) => ({ ...s, [t.id]: onlyDigits(e.target.value, 6) }))}
                    />
                    <TableBtn tone="azur" disabled={!inputs[t.id]} onClick={() => recharger(t.id)}>
                      Recharger
                    </TableBtn>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {data.tricycles.length === 0 && <p className="mt-4 font-semibold text-ink/60">Aucun chauffeur inscrit.</p>}
    </Panel>
  );
}
