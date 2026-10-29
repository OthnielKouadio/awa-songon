"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Btn, ErrorBox, LinkBtn, Spinner, roleLabel, useConfirm, type BadgeTone } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { STATUT_COMMANDE, dateHeure, fcfa, formatProgrammee } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useRpc } from "@/lib/useRpc";
import { Chip } from "../shared";

type Commande = {
  id: string;
  reference: string;
  statut: "EN_ATTENTE" | "EN_PAUSE" | "PROGRAMMEE" | "EN_ROUTE" | "ARRIVE" | "LIVREE" | "ANNULEE";
  created_at: string;
  scheduled_for: string;
  programmee_pour: string | null;
  code_affichage: string;
  nom_famille: string;
  commande_par: string;
  role_commande: string | null;
  telephone_contact: string | null;
  prix_fcfa: number;
  source: "APP" | "LIVREUR";
  note: string | null;
  livreur: string;
  cite: string;
  position: number | null;
};

const TONE: Record<Commande["statut"], BadgeTone> = {
  EN_ATTENTE: "azur",
  EN_PAUSE: "orange",
  PROGRAMMEE: "gray",
  EN_ROUTE: "green",
  ARRIVE: "green",
  LIVREE: "green",
  ANNULEE: "gray",
};
const ACTIVES = ["EN_ATTENTE", "EN_PAUSE", "PROGRAMMEE", "EN_ROUTE", "ARRIVE"];

/** Flux des commandes (V2) : temps réel, filtre par statut et par origine. */
export default function CommandesPage() {
  const [actives, setActives] = useState(true);
  const [source, setSource] = useState<"TOUS" | "APP" | "LIVREUR">("TOUS");
  const { data, err, chargement, reload } = useRpc<Commande[]>("admin_commandes", { p_actives: actives }, String(actives));
  const [actionErr, setActionErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  useLiveRefresh(["admin"], () => void reload(), 20000);

  const statut = async (c: Commande, s: "EN_ROUTE" | "LIVREE" | "ANNULEE") => {
    setActionErr(null);
    if (s === "ANNULEE" && !(await confirm(<>Annuler la commande <strong>#{c.reference}</strong> ({c.code_affichage}) ? Les points sont recrédités.</>, { danger: true, confirmLabel: "Annuler la commande" })))
      return;
    try {
      await rpc("admin_commande_statut", { p_id: c.id, p_statut: s });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };

  const liste = (data ?? []).filter((c) => source === "TOUS" || c.source === source);

  return (
    <div className="space-y-5">
      <h1 className="title-lg">Commandes</h1>
      <div className="flex flex-wrap gap-1.5">
        <Chip actif={actives} onClick={() => setActives(true)}>
          En cours
        </Chip>
        <Chip actif={!actives} onClick={() => setActives(false)}>
          Historique
        </Chip>
        <span className="mx-2 w-px bg-ink/20" />
        {(
          [
            ["TOUS", "Tous"],
            ["APP", "Application"],
            ["LIVREUR", "Saisie directe"],
          ] as const
        ).map(([v, l]) => (
          <Chip key={v} actif={source === v} onClick={() => setSource(v)}>
            {l}
          </Chip>
        ))}
      </div>
      {err && <ErrorBox>{err}</ErrorBox>}
      {actionErr && <ErrorBox>{actionErr}</ErrorBox>}
      {chargement && !data && <Spinner />}
      {data && liste.length === 0 && <p className="py-6 text-center font-semibold text-ink/50">{actives ? "Aucune commande en cours." : "Aucune commande."}</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {liste.map((c) => (
          <li key={c.id} className="rounded-brut border-brut border-ink bg-white p-4 shadow-hard-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink/55">
                #{c.reference} · {dateHeure(c.created_at)}
              </span>
              <div className="flex gap-1">
                <Badge tone={c.source === "LIVREUR" ? "orange" : "sky"}>{c.source === "LIVREUR" ? "Saisie directe" : "Application"}</Badge>
                <Badge tone={TONE[c.statut]}>{STATUT_COMMANDE[c.statut]}</Badge>
              </div>
            </div>
            {/* Ce que le livreur doit lire : où aller, pour qui. */}
            <p className="mt-2 font-display text-2xl font-bold leading-tight">Livrer {c.code_affichage}</p>
            <p className="font-semibold">
              {c.nom_famille} · commandé par {c.commande_par}
              {c.role_commande ? ` (${roleLabel(c.role_commande)})` : ""}
            </p>
            {c.note && <p className="mt-1 text-sm font-semibold text-ink/70">« {c.note} »</p>}
            <p className="mt-1 text-sm text-ink/60">
              {c.livreur}
              {c.statut === "PROGRAMMEE" ? ` · programmée ${formatProgrammee(c.programmee_pour)}` : c.position ? ` · N°${c.position} dans sa file` : ""} · {fcfa(c.prix_fcfa)} · {c.cite}
            </p>
            {ACTIVES.includes(c.statut) && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
                {c.telephone_contact && (
                  <LinkBtn href={`tel:${c.telephone_contact}`} variant="white">
                    <Icon name="phone" size={18} /> {formatPhone(c.telephone_contact)}
                  </LinkBtn>
                )}
                {["EN_ATTENTE", "EN_PAUSE", "PROGRAMMEE"].includes(c.statut) && (
                  <Btn variant="white" onClick={() => void statut(c, "EN_ROUTE")}>
                    En route
                  </Btn>
                )}
                <Btn variant="azur" onClick={() => void statut(c, "LIVREE")}>
                  <Icon name="check" size={18} /> Livrée
                </Btn>
                <Btn variant="danger" onClick={() => void statut(c, "ANNULEE")}>
                  Annuler
                </Btn>
              </div>
            )}
          </li>
        ))}
      </ul>
      {dialog}
    </div>
  );
}
