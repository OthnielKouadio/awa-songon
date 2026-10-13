"use client";

import { createContext, useContext } from "react";

/** URL publique (secrète) de l'espace courant, ex. "/admin-8K2pL9xQ…", fournie par le
 *  layout serveur de l'espace — les liens internes ne doivent jamais viser /admin
 *  ou /chauffeur directement (404). */
const Ctx = createContext<string>("/");

export function PrivateBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <Ctx.Provider value={base}>{children}</Ctx.Provider>;
}

export const usePrivateBase = () => useContext(Ctx);
