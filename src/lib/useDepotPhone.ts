"use client";

import { useEffect, useState } from "react";
import { api } from "./data-provider";

/** Numéro de dépôt Wave (settings.depot_phone, modifiable dans Paramètres admin).
 *  null tant qu'il n'est pas chargé : aucun numéro de repli codé en dur. */
export function useDepotPhone(): string | null {
  const [tel, setTel] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .fetchDepotPhone()
      .then((t) => alive && setTel(t || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return tel;
}
