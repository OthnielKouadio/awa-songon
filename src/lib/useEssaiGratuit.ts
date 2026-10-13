"use client";

import { useEffect, useState } from "react";
import { api } from "./data-provider";
import { jourAbidjan } from "./format";

/** true pendant la période d'essai (settings.trial_ends_at), false après, null
 *  tant que ce n'est pas chargé — l'appelant n'affiche alors rien plutôt qu'un
 *  statut qui clignote. Date illisible (base pas encore à jour, réseau) : on
 *  reste en essai, c'est la phase en cours — jamais « Impayé » par erreur. */
export function useEssaiGratuit(): boolean | null {
  const [essai, setEssai] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .fetchEssaiFin()
      .then((fin) => alive && setEssai(!fin || jourAbidjan() <= fin))
      .catch(() => alive && setEssai(true));
    return () => {
      alive = false;
    };
  }, []);
  return essai;
}
