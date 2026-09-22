"use client";

import { useEffect, useRef } from "react";
import { MOCK_EVENT } from "./mock";
import { getSupabase, isSupabaseConfigured } from "./supabase";

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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ping = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250); // regroupe les rafales
    };

    const sb = isSupabaseConfigured ? getSupabase() : null;
    const channels = sb
      ? key
          .split("|")
          .filter(Boolean)
          .map((name) => sb.channel(name).on("broadcast", { event: "changed" }, ping).subscribe())
      : [];

    if (!sb) {
      window.addEventListener(MOCK_EVENT, ping);
      window.addEventListener("storage", ping);
    }

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
      window.removeEventListener(MOCK_EVENT, ping);
      window.removeEventListener("storage", ping);
      channels.forEach((c) => void sb?.removeChannel(c));
    };
  }, [key, pollMs]);
}
