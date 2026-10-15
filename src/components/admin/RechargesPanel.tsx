"use client";

import { useState } from "react";
import { api } from "@/lib/data-provider";
import { enEssai, formatPoints, jour, onlyDigits, RECHARGE_MULTIPLE, RECHARGE_MULTIPLE_CLIENT, SOLDE_MIN, SOLDE_MIN_CLIENT } from "@/lib/format";
import type { AdminData, Creds } from "@/lib/types";
import { Badge, ErrorBox, Table, TableBtn, Td, Th } from "../ui";
import { correspond, Panel, RechercheCompte, useMutation } from "./shared";

type Titulaire = { id: string; nom: string; telephone: string; solde_points: number; essai_fin: string | null; hors_ligne?: boolean };

export default function RechargesPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, error, setError } = useMutation(reload);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [recherche, setRecherche] = useState("");

  function recharger(table: "tricycles" | "clients", id: string) {
    const montant = Number(inputs[id]);
    if (!Number.isFinite(montant) || montant <= 0) return setError("Entre un montant.");
    const multiple = table === "clients" ? RECHARGE_MULTIPLE_CLIENT : RECHARGE_MULTIPLE;
    if (montant % multiple !== 0) return setError(`Le montant doit être un multiple de ${multiple}.`);
    void run(() => api.admin.rechargerPoints(creds, table, id, montant)).then((ok) => {
      if (ok) setInputs((s) => ({ ...s, [id]: "" }));
    });
  }

  const chauffeurs: Titulaire[] = data.tricycles
    .filter((t) => correspond(t, recherche))
    .map((t) => ({ id: t.id, nom: t.nom, telephone: t.telephone, solde_points: t.solde_points, essai_fin: t.essai_fin, hors_ligne: t.is_offline && !enEssai(t.essai_fin) }));
  const clients: Titulaire[] = data.clients
    .filter((c) => !c.is_temporary && correspond(c, recherche))
    .map((c) => ({ id: c.id, nom: c.nom, telephone: c.telephone, solde_points: c.solde_points, essai_fin: c.essai_fin }));

  return (
    <Panel title="Recharges de points">
      <p className="mb-5 max-w-2xl text-sm font-medium text-ink/60">
        1 FCFA = 1 point — système 100% recharge, clients et chauffeurs. Un chauffeur sous {formatPoints(SOLDE_MIN)} n&apos;est plus visible
        des clients ; un client sous {formatPoints(SOLDE_MIN_CLIENT)} ne peut plus commander. Recharge ici après réception d&apos;un
        paiement Wave — le montant doit être un multiple de {RECHARGE_MULTIPLE} pour un chauffeur, de {RECHARGE_MULTIPLE_CLIENT} pour un
        client (dès {RECHARGE_MULTIPLE_CLIENT} FCFA). Pendant son essai gratuit, un compte n&apos;utilise pas ses
        points : une recharge faite pendant l&apos;essai sert après.
      </p>
      <RechercheCompte value={recherche} onChange={setRecherche} />
      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <h3 className="title-md mb-3 !text-lg">Chauffeurs</h3>
      <RechargeTable titulaires={chauffeurs} seuil={SOLDE_MIN} inputs={inputs} setInputs={setInputs} onRecharger={(id) => recharger("tricycles", id)} />
      {chauffeurs.length === 0 && <p className="mt-3 font-semibold text-ink/60">{recherche ? "Aucun chauffeur ne correspond." : "Aucun chauffeur inscrit."}</p>}

      <h3 className="title-md mb-3 mt-8 !text-lg">Clients</h3>
      <RechargeTable titulaires={clients} seuil={SOLDE_MIN_CLIENT} inputs={inputs} setInputs={setInputs} onRecharger={(id) => recharger("clients", id)} />
      {clients.length === 0 && <p className="mt-3 font-semibold text-ink/60">{recherche ? "Aucun client ne correspond." : "Aucun client inscrit."}</p>}
    </Panel>
  );
}

function RechargeTable({
  titulaires,
  seuil,
  inputs,
  setInputs,
  onRecharger,
}: {
  titulaires: Titulaire[];
  seuil: number;
  inputs: Record<string, string>;
  setInputs: (fn: (s: Record<string, string>) => Record<string, string>) => void;
  onRecharger: (id: string) => void;
}) {
  if (titulaires.length === 0) return null;
  return (
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
        {titulaires.map((t) => {
          const essai = enEssai(t.essai_fin);
          const faible = !essai && t.solde_points < seuil;
          return (
            <tr key={t.id}>
              <Td>
                <span className="font-bold">{t.nom}</span>
              </Td>
              <Td>{t.telephone}</Td>
              <Td>
                <Badge tone={faible ? "danger" : "sky"}>
                  {formatPoints(t.solde_points)}
                  {t.hors_ligne && " · hors ligne"}
                </Badge>
                {essai && t.essai_fin && <span className="ml-2 text-xs font-semibold text-ink/55">essai jusqu&apos;au {jour(t.essai_fin)}</span>}
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
                  <TableBtn tone="azur" disabled={!inputs[t.id]} onClick={() => onRecharger(t.id)}>
                    Recharger
                  </TableBtn>
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
