"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messageErreur, rpc } from "./api";

/** Charge une RPC et la recharge quand `cle` change. `reload()` pour forcer. */
export function useRpc<T>(fn: string, args: Record<string, unknown> | undefined, cle: string) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const argsRef = useRef(args);
  argsRef.current = args;
  const tour = useRef(0);

  const reload = useCallback(async () => {
    const n = ++tour.current;
    setChargement(true);
    try {
      const d = await rpc<T>(fn, argsRef.current);
      if (n === tour.current) {
        setData(d);
        setErr(null);
      }
    } catch (e) {
      if (n === tour.current) setErr(messageErreur(e));
    } finally {
      if (n === tour.current) setChargement(false);
    }
  }, [fn]);

  useEffect(() => {
    void reload();
  }, [reload, cle]);

  return { data, err, chargement, reload };
}
