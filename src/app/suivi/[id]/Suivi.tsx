"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { SuiviLivraison, type CommandeSuivi } from "@/components/SuiviLivraison";
import { ErrorBox, Logo, Spinner } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { heure } from "@/lib/format";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

type Donnees = CommandeSuivi & {
  code_affichage: string;
  livree_at: string | null;
  maison: { lat: number; long: number } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lien de suivi partageable (V2), sans compte : statut, file, carte en direct.
 *  Aucune donnée du foyer n'y figure (voir suivi_commande). */
export function Suivi({ id }: { id: string }) {
  const [d, setD] = useState<Donnees | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!UUID.test(id)) return setD(null);
    try {
      setD(await rpc<Donnees | null>("suivi_commande", { p_id: id }));
    } catch (e) {
      setErr(messageErreur(e));
    }
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);
  useLiveRefresh([], () => void charger(), 15000);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-6">
        <Logo href="/" />
      </header>
      {d === undefined && !err && <Spinner />}
      {err && <ErrorBox>{err}</ErrorBox>}
      {d === null && <ErrorBox>Ce suivi n&apos;existe pas ou a expiré.</ErrorBox>}
      {d && d.statut === "LIVREE" && (
        <div className="space-y-4 pt-6 text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-azur text-white shadow-hard">
            <Icon name="check" size={48} />
          </div>
          <h1 className="title-xl !text-5xl">Livré !</h1>
          <p className="text-lg text-ink/70">
            {d.code_affichage}
            {d.livree_at ? ` · livré à ${heure(d.livree_at)}` : ""}
          </p>
        </div>
      )}
      {d && d.statut === "ANNULEE" && <ErrorBox>Cette commande a été annulée.</ErrorBox>}
      {d && d.statut !== "LIVREE" && d.statut !== "ANNULEE" && (
        <div className="space-y-4">
          <p className="text-center font-display text-3xl font-bold">{d.code_affichage}</p>
          <SuiviLivraison c={{ ...d, id }} maison={{ lat: d.maison?.lat ?? null, long: d.maison?.long ?? null, code_affichage: d.code_affichage }} />
        </div>
      )}
    </main>
  );
}
