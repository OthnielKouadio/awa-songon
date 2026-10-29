"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AvisForm } from "@/components/AvisForm";
import { ErrorBox, Logo, Spinner, SuccessBox } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { tousLesAppareils, type AppareilLocal } from "@/lib/appareils";

type Maison = AppareilLocal & { qr: string };

/** Avis sur la plateforme : réservé à un foyer connecté sur ce téléphone
 *  (le serveur vérifie le jeton). Un avis par foyer et par semaine. */
export function AvisPlateforme({ qr }: { qr: string | null }) {
  const [maisons, setMaisons] = useState<Maison[] | null>(null);
  const [choisie, setChoisie] = useState<Maison | null>(null);
  const [merci, setMerci] = useState(false);

  useEffect(() => {
    const toutes = tousLesAppareils();
    setMaisons(toutes);
    setChoisie(toutes.find((m) => m.qr === qr) ?? (toutes.length === 1 ? toutes[0] : null));
  }, [qr]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      <header className="mb-6">
        <Logo href={choisie ? `/m/${choisie.qr}` : "/"} />
      </header>
      <h1 className="title-lg">Ton avis sur Distribution Eau</h1>
      <p className="mb-6 mt-2 text-ink/70">L&apos;appli, les livraisons, le service : dis-nous tout.</p>

      {maisons === null && <Spinner />}
      {maisons?.length === 0 && <ErrorBox>Ouvre d&apos;abord ta maison en scannant le QR code collé sur ton portail.</ErrorBox>}
      {maisons && maisons.length > 1 && !choisie && (
        <div className="space-y-2">
          <p className="label">Pour quelle maison ?</p>
          {maisons.map((m) => (
            <button key={m.qr} onClick={() => setChoisie(m)} className="w-full rounded-2xl border-brut border-ink bg-white p-4 text-left text-lg font-bold hover:bg-sky">
              {m.code_affichage}
            </button>
          ))}
        </div>
      )}
      {merci && choisie && (
        <div className="space-y-5 text-center">
          <SuccessBox>Merci pour ton avis !</SuccessBox>
          <Link href={`/m/${choisie.qr}`} className="font-bold text-azur hover:underline">
            ← Retour à ma maison
          </Link>
        </div>
      )}
      {choisie && !merci && (
        <>
          <p className="mb-4 font-semibold text-ink/60">Maison {choisie.code_affichage}</p>
          <AvisForm
            onEnvoyer={async (note, commentaire) => {
              try {
                await rpc("m_avis_plateforme", { p_qr: choisie.qr, p_jeton: choisie.jeton, p_note: note, p_commentaire: commentaire || null });
              } catch (e) {
                throw new Error(messageErreur(e));
              }
              setMerci(true);
            }}
          />
        </>
      )}
    </main>
  );
}
