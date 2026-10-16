"use client";

import { useEffect, useRef } from "react";
import { api } from "./data-provider";

/**
 * Rafraîchit des données en direct.
 * - Supabase : pings broadcast (cite:<id>, tricycle:<id>) émis par des triggers SQL.
 * - Démo     : évènements localStorage (synchro entre onglets).
 * Un polling de secours garde l'écran à jour même si le WebSocket tombe.
 */
export function useLiveRefresh(
  topics: (string | null | undefined)[],
  refresh: () => void,
  pollMs = 15000
) {
  const cb = useRef(refresh);
  cb.current = refresh;
  const key = topics.filter(Boolean).join("|");

  useEffect(() => {
    // Les canaux broadcast sont publics : n'importe qui peut y envoyer des pings.
    // On regroupe les rafales (250 ms) et on recharge au plus une fois toutes les
    // 3 s, pour qu'un flot de faux pings ne transforme pas chaque téléphone en
    // relais d'attaque contre la base.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dernier = 0;
    const ping = () => {
      if (timer) clearTimeout(timer);
      const attente = Math.max(250, dernier + 3000 - Date.now());
      timer = setTimeout(() => {
        dernier = Date.now();
        cb.current();
      }, attente);
    };

    const unsubscribe = api.subscribeTopics(key.split("|").filter(Boolean), ping);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") cb.current();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") cb.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [key, pollMs]);
}
