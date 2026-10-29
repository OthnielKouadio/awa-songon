"use client";

import { createContext, useContext, type ReactNode } from "react";

/** URL publiques des espaces (chemins secrets), fournies par le layout serveur. */
export type Bases = { admin: string; livreur: string; recrutement: string };
const Ctx = createContext<Bases>({ admin: "/admin", livreur: "/livreur", recrutement: "/recrutement-chauffeur" });

export function BasesProvider({ bases, children }: { bases: Bases; children: ReactNode }) {
  return <Ctx.Provider value={bases}>{children}</Ctx.Provider>;
}

export const useBases = () => useContext(Ctx);

/** Lien interne de l'admin : a("/maisons") → "/<ADMIN_PATH>/maisons". */
export function useAdminHref() {
  const { admin } = useContext(Ctx);
  return (chemin: string) => `${admin}${chemin}`;
}
