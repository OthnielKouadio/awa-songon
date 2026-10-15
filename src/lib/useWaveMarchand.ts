"use client";

import { useEffect, useState } from "react";
import { api } from "./data-provider";
import { WAVE_MARCHAND_DEFAUT } from "./format";

/** Nom du marchand Wave (settings.wave_marchand, modifiable dans Paramètres admin).
 *  Nom par défaut tant qu'il n'est pas chargé (ou si la lecture échoue). */
export function useWaveMarchand(): string {
  const [nom, setNom] = useState(WAVE_MARCHAND_DEFAUT);
  useEffect(() => {
    let alive = true;
    api
      .fetchWaveMarchand()
      .then((n) => alive && n && setNom(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return nom;
}
