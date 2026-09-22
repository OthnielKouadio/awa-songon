"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import OrderTracker from "@/components/OrderTracker";
import { Btn, ErrorBox, Logo, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { Suivi } from "@/lib/types";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lien de suivi "secret" (l'UUID de la commande) — utile pour partager l'état
 *  d'une livraison sans que le destinataire ait besoin d'un compte. */
export default function SuiviPage() {
  const { id } = useParams<{ id: string }>();
  const valid = UUID.test(id ?? "");
  const [suivi, setSuivi] = useState<Suivi | null | undefined>(undefined); // undefined = chargement
  const [error, setError] = useState("");
  const startRef = useRef(1);

  const load = useCallback(async () => {
    if (!valid) return;
    try {
      const s = await api.fetchSuivi(id);
      setSuivi(s);
      setError("");
      if (s) startRef.current = Math.max(startRef.current, s.position_file);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, valid]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh([suivi ? `tricycle:${suivi.tricycle_id}` : null], load, 10000);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6">
      <header>
        <Logo href="/" />
      </header>

      <div className="mt-12">
        {!valid && <NotFound />}
        {valid && error && !suivi && <ErrorBox>{error}</ErrorBox>}
        {valid && suivi === undefined && !error && <Spinner label="On cherche ta commande" />}
        {valid && suivi === null && <NotFound />}
        {suivi && <OrderTracker s={suivi} start={startRef.current} />}
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <div className="brut p-6">
      <p className="title-md">Commande introuvable</p>
      <p className="mt-2 font-medium text-ink/60">Vérifie le lien.</p>
      <Link href="/" className="mt-5 inline-block">
        <Btn variant="ink">Retour</Btn>
      </Link>
    </div>
  );
}
