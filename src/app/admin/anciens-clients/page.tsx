"use client";

import { useEffect, useState } from "react";
import { Btn, ErrorBox, Modal, ModalTitle, Spinner, SuccessBox } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { dateCourte, points } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { useRpc } from "@/lib/useRpc";
import type { MaisonLigne } from "../types";

type ClientV2 = { id: string; nom: string; telephone: string; cite: string | null; lot: string; solde_points: number; created_at: string; code_reutilisable: boolean };

/**
 * Clients inscrits en V2 (porte-à-porte). Rattacher un client à sa maison :
 * il devient titulaire du foyer, garde son numéro ET son code (son ancien PIN
 * devient le code maison). Points V2 non repris : recharger à la main si besoin.
 */
export default function AnciensClientsPage() {
  const { data, err, chargement, reload } = useRpc<ClientV2[]>("admin_clients_v2", undefined, "v2");
  const [client, setClient] = useState<ClientV2 | null>(null);
  const [resultat, setResultat] = useState<{ nom: string; maison: string; code: string | null; solde: number } | null>(null);
  const [q, setQ] = useState("");

  const liste = (data ?? []).filter((c) => !q || `${c.nom} ${c.telephone} ${c.lot}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="title-lg">Anciens clients</h1>
        <p className="mt-1 text-ink/65">
          Inscrits en V2 (porte-à-porte). Rattache chacun à sa maison : il se connecte ensuite avec <strong>son numéro et son ancien code</strong>.
        </p>
      </div>
      {resultat && (
        <SuccessBox>
          {resultat.nom} est rattaché(e) à {resultat.maison}.{" "}
          {resultat.code ? (
            <>
              Son ancien code n&apos;était pas réutilisable : dicte-lui ce code provisoire : <strong className="text-xl">{resultat.code}</strong> (il en choisira un nouveau).
            </>
          ) : (
            "Il/elle garde son ancien code."
          )}
          {resultat.solde > 0 && <> Il avait {points(resultat.solde)} en V2 : recharge-le à la main dans la fiche maison si tu veux les lui rendre.</>}
        </SuccessBox>
      )}
      {err && <ErrorBox>{err}</ErrorBox>}
      {chargement && !data && <Spinner />}
      {data && data.length > 0 && <input className="field" placeholder="Rechercher : nom, numéro, lot" value={q} onChange={(e) => setQ(e.target.value)} />}
      {data?.length === 0 && <p className="py-6 text-center font-semibold text-ink/50">Aucun ancien client à rattacher.</p>}
      <ul className="grid gap-2 md:grid-cols-2">
        {liste.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border-brut border-ink bg-white p-4">
            <span>
              <strong className="text-lg">{c.nom}</strong>
              <span className="block text-sm text-ink/60">
                {formatPhone(c.telephone)} · {c.cite ?? "?"} · lot {c.lot}
              </span>
              <span className="block text-xs text-ink/50">
                Inscrit le {dateCourte(c.created_at)}
                {c.solde_points > 0 ? ` · ${points(c.solde_points)} en V2` : ""}
              </span>
            </span>
            <Btn onClick={() => setClient(c)}>Rattacher</Btn>
          </li>
        ))}
      </ul>
      <ModalRattacher
        client={client}
        onClose={() => setClient(null)}
        onFait={(r) => {
          setResultat(r);
          setClient(null);
          void reload();
        }}
      />
    </div>
  );
}

function ModalRattacher({
  client,
  onClose,
  onFait,
}: {
  client: ClientV2 | null;
  onClose: () => void;
  onFait: (r: { nom: string; maison: string; code: string | null; solde: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [recherche, setRecherche] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setQ(client ? client.lot.replace(/\D/g, "") : "");
    setErr(null);
  }, [client]);
  useEffect(() => {
    const t = setTimeout(() => setRecherche(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const args = { p_cite: null, p_statut: "LIBRE", p_recherche: recherche || null };
  const { data } = useRpc<MaisonLigne[]>("admin_maisons", args, JSON.stringify(args));

  const rattacher = async (m: MaisonLigne) => {
    if (!client) return;
    setErr(null);
    try {
      const r = await rpc<{ code_affichage: string; code_provisoire: string | null }>("admin_rattacher_client_v2", { p_client: client.id, p_maison: m.id });
      onFait({ nom: client.nom, maison: r.code_affichage, code: r.code_provisoire, solde: client.solde_points });
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  return (
    <Modal open={!!client} onClose={onClose}>
      <ModalTitle onClose={onClose}>Rattacher {client?.nom}</ModalTitle>
      <div className="space-y-3">
        <p className="text-sm text-ink/65">
          Ancien lot : <strong>{client?.lot}</strong> ({client?.cite}). Choisis sa maison (seules les maisons libres sont proposées).
        </p>
        <input className="field" placeholder="PROMO 012, 12…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {err && <ErrorBox>{err}</ErrorBox>}
        <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto">
          {data?.slice(0, 50).map((m) => (
            <li key={m.id}>
              <button onClick={() => void rattacher(m)} className="flex w-full items-center justify-between rounded-xl border-[1.5px] border-ink bg-white px-4 py-2.5 text-left font-bold hover:bg-sky">
                <span className="font-display text-xl">{m.code_affichage}</span>
                <span className="text-sm text-ink/55">{m.cite}</span>
              </button>
            </li>
          ))}
          {data?.length === 0 && <li className="text-sm font-semibold text-ink/55">Aucune maison libre ne correspond.</li>}
        </ul>
      </div>
    </Modal>
  );
}
