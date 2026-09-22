"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Btn, LinkBtn, Logo } from "@/components/ui";
import { NUMERO_ABONNEMENT, PRIX_ABONNEMENT, formatFcfa } from "@/lib/format";
import { clearSession, readSession } from "@/lib/session";

const WHATSAPP = `https://wa.me/225${NUMERO_ABONNEMENT}?text=${encodeURIComponent("J'ai payé mon abonnement 1000F")}`;

/** Destination de redirection quand l'abonnement du client a expiré
 *  (vérifié dans le tableau de bord client, avant de rendre le contenu). */
export default function BloquePage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setHasSession(true);
  }, [router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!hasSession) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo href="/bloque" />
        <button onClick={logout} className="text-sm font-semibold text-ink/60 underline-offset-4 hover:text-azur hover:underline">
          Quitter
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="brut p-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-danger/10 text-danger">
            <Icon name="lock" size={32} />
          </span>
          <h1 className="title-lg mt-5">Compte bloqué</h1>
          <p className="mt-3 font-medium text-ink/70">
            Votre abonnement a expiré. Vous devez payer <strong>{formatFcfa(PRIX_ABONNEMENT)}</strong> au{" "}
            <strong>{NUMERO_ABONNEMENT}</strong> pour pouvoir réutiliser votre compte.
          </p>

          <LinkBtn href={WHATSAPP} target="_blank" rel="noopener noreferrer" variant="ink" size="lg" className="mt-6 w-full">
            <Icon name="phone" size={20} /> J&apos;ai payé, prévenir sur WhatsApp
          </LinkBtn>
          <Btn variant="white" className="mt-3 w-full" onClick={() => router.replace("/dashboard")}>
            Réessayer
          </Btn>
        </motion.div>
      </div>
    </main>
  );
}
