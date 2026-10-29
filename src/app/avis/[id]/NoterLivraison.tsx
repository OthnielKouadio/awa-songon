"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AvisForm } from "@/components/AvisForm";
import { ErrorBox, Logo, Spinner, SuccessBox } from "@/components/ui";
import { ApiError, messageErreur, rpc } from "@/lib/api";
import { appareilPour, tousLesAppareils } from "@/lib/appareils";
import { dateHeure } from "@/lib/format";

type Info = { reference: string; statut: string; livree_at: string | null; code_affichage: string; livreur_nom: string; deja_note: boolean; expire: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accessible uniquement au foyer livré : le serveur vérifie que le téléphone
 * (jeton) appartient au foyer de cette commande. Une seule note par livraison.
 */
export function NoterLivraison({ commandeId, qr }: { commandeId: string; qr: string | null }) {
  const [etat, setEtat] = useState<{ t: "chargement" } | { t: "erreur"; msg: string } | { t: "pret"; qr: string; info: Info } | { t: "merci"; qr: string }>({ t: "chargement" });

  useEffect(() => {
    (async () => {
      if (!UUID.test(commandeId)) return setEtat({ t: "erreur", msg: messageErreur(new ApiError("COMMANDE_INTROUVABLE")) });
      // Maison indiquée dans le lien d'abord, sinon toutes celles connues de ce téléphone.
      const candidats = qr && appareilPour(qr) ? [{ qr, ...appareilPour(qr)! }] : tousLesAppareils();
      if (candidats.length === 0) return setEtat({ t: "erreur", msg: "Ouvre d'abord ta maison en scannant son QR code." });
      for (const c of candidats) {
        try {
          const info = await rpc<Info>("m_avis_commande", { p_qr: c.qr, p_jeton: c.jeton, p_commande: commandeId });
          return setEtat({ t: "pret", qr: c.qr, info });
        } catch (e) {
          if (!(e instanceof ApiError) || !["COMMANDE_INTROUVABLE", "SESSION"].includes(e.code)) return setEtat({ t: "erreur", msg: messageErreur(e) });
        }
      }
      setEtat({ t: "erreur", msg: messageErreur(new ApiError("COMMANDE_INTROUVABLE")) });
    })();
  }, [commandeId, qr]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      <header className="mb-6">
        <Logo href={etat.t === "pret" || etat.t === "merci" ? `/m/${etat.qr}` : "/"} />
      </header>
      {etat.t === "chargement" && <Spinner />}
      {etat.t === "erreur" && <ErrorBox>{etat.msg}</ErrorBox>}
      {etat.t === "merci" && (
        <div className="space-y-5 text-center">
          <SuccessBox>Merci ! Ton avis aide à améliorer le service.</SuccessBox>
          <Link href={`/m/${etat.qr}`} className="font-bold text-azur hover:underline">
            ← Retour à ma maison
          </Link>
        </div>
      )}
      {etat.t === "pret" && (
        <div className="space-y-6">
          <div className="brut p-5 text-center">
            <p className="label">Livraison #{etat.info.reference} · {etat.info.code_affichage}</p>
            <h1 className="title-md">Comment était la livraison de {etat.info.livreur_nom} ?</h1>
            {etat.info.livree_at && <p className="mt-2 text-sm text-ink/60">Livrée le {dateHeure(etat.info.livree_at)}</p>}
          </div>
          {etat.info.deja_note ? (
            <SuccessBox>Cette livraison a déjà été notée. Merci !</SuccessBox>
          ) : etat.info.statut !== "LIVREE" ? (
            <ErrorBox>{messageErreur(new ApiError("PAS_ENCORE_LIVREE"))}</ErrorBox>
          ) : etat.info.expire ? (
            <ErrorBox>{messageErreur(new ApiError("AVIS_EXPIRE"))}</ErrorBox>
          ) : (
            <AvisForm
              onEnvoyer={async (note, commentaire) => {
                const jeton = appareilPour(etat.qr)?.jeton ?? "";
                try {
                  await rpc("m_noter_livreur", { p_qr: etat.qr, p_jeton: jeton, p_commande: commandeId, p_note: note, p_commentaire: commentaire || null });
                } catch (e) {
                  throw new Error(messageErreur(e));
                }
                setEtat({ t: "merci", qr: etat.qr });
              }}
            />
          )}
        </div>
      )}
    </main>
  );
}
