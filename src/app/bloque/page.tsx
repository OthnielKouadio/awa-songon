"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Btn, LinkBtn, Logo, Spinner } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { AppError, errorMessage } from "@/lib/errors";
import { formatPoints, RECHARGE_MIN_FCFA, formatFcfa } from "@/lib/format";
import { callLink, formatPhone } from "@/lib/phone";
import { clearSession, readSession } from "@/lib/session";
import type { Creds } from "@/lib/types";
import { useDepotPhone } from "@/lib/useDepotPhone";

/** Destination de redirection quand le solde de points du client tombe sous
 *  le minimum (vérifié dans le tableau de bord client, avant de rendre le
 *  contenu) — système 100% recharge, plus d'abonnement basé sur une date. */
export default function BloquePage() {
  const router = useRouter();
  const [creds, setCreds] = useState<Creds | null | undefined>(undefined);

  useEffect(() => {
    const s = readSession();
    if (!s || s.role !== "client") {
      router.replace("/login");
      return;
    }
    setCreds(s);
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    router.replace("/login");
  }, [router]);

  if (creds === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }
  if (!creds) return null;

  return <Bloque creds={creds} onLogout={logout} />;
}

function Bloque({ creds, onLogout }: { creds: Creds; onLogout: () => void }) {
  const router = useRouter();
  const depot = useDepotPhone();
  const [solde, setSolde] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await api.clientProfil(creds);
      if (p.solde_points >= 100) {
        router.replace("/dashboard");
        return;
      }
      setSolde(p.solde_points);
    } catch (e) {
      if (e instanceof AppError && (e.code === "AUTH" || e.code === "REFUSE")) onLogout();
      else setError(errorMessage(e));
    }
  }, [creds, onLogout, router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo href="/bloque" />
        <button onClick={onLogout} className="text-sm font-semibold text-ink/60 underline-offset-4 hover:text-azur hover:underline">
          Quitter
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        {solde === null ? (
          error ? (
            <p className="text-center font-semibold text-danger">{error}</p>
          ) : (
            <Spinner />
          )
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="brut p-6 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-danger/10 text-danger">
              <Icon name="lock" size={32} />
            </span>
            <h1 className="title-lg mt-5">Solde insuffisant</h1>
            <p className="mt-3 font-medium text-ink/70">
              Rechargez par Wave au <strong>{depot ? formatPhone(depot) : "…"}</strong> pour continuer. Minimum {formatFcfa(RECHARGE_MIN_FCFA)} ({RECHARGE_MIN_FCFA} points).
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-danger bg-danger/10 px-4 py-2 font-bold text-danger">
              Solde actuel : {formatPoints(solde)}
            </div>

            {depot && (
              <LinkBtn href={callLink(depot)} variant="ink" size="lg" className="mt-6 w-full">
                <Icon name="phone" size={20} /> Appeler pour recharger
              </LinkBtn>
            )}
            <Btn variant="white" className="mt-3 w-full" onClick={() => void load()}>
              Réessayer
            </Btn>
          </motion.div>
        )}
      </div>
    </main>
  );
}
