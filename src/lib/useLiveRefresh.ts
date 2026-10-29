"use client";

import { useEffect, useRef } from "react";
import { getSupabase } from "./supabase";

/**
 * Rafraîchit des données en direct (comme en V2) :
 * - pings broadcast Supabase SANS donnée (maison:<id>, livreur:<id>, cite:<id>,
 *   admin) émis par des triggers SQL → on relit via RPC (jeton exigé) ;
 * - polling de secours si le WebSocket tombe, et au retour sur l'appli.
 */
export function useLiveRefresh(topics: (string | null | undefined)[], refresh: () => void, pollMs = 20000) {
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

    const sb = getSupabase();
    const canaux = sb ? key.split("|").filter(Boolean).map((t) => sb.channel(t).on("broadcast", { event: "changed" }, ping).subscribe()) : [];

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
      canaux.forEach((c) => void sb?.removeChannel(c));
    };
  }, [key, pollMs]);
}

export type PositionLive = { lat: number; long: number; at: string };

/** Position du livreur diffusée sur suivi:<commande> pendant « J'arrive chez toi ». */
export function usePositionLive(commandeId: string | null, onPosition: (p: PositionLive) => void) {
  const cb = useRef(onPosition);
  cb.current = onPosition;
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !commandeId) return;
    const ch = sb
      .channel(`suivi:${commandeId}`)
      .on("broadcast", { event: "position" }, ({ payload }) => {
        const p = payload as { lat?: number; long?: number; at?: string };
        if (typeof p.lat === "number" && typeof p.long === "number") cb.current({ lat: p.lat, long: p.long, at: p.at ?? new Date().toISOString() });
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [commandeId]);
}
