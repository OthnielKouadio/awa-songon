import { remote } from "./remote";
import type { Backend } from "./types";

/**
 * Point d'entrée UNIQUE des données : tout le code métier de l'app appelle `api`,
 * sans jamais savoir s'il parle à Supabase ou à la démo.
 *
 * - NEXT_PUBLIC_DEMO_MODE=true  → mode démo (localStorage, mock.ts)
 * - sinon                       → Supabase (remote.ts). Variables manquantes =
 *   erreur explicite, JAMAIS de bascule silencieuse vers la démo.
 *
 * NEXT_PUBLIC_DEMO_MODE est figé au build (next.config.mjs le définit toujours) :
 * webpack élimine alors la branche morte, et mock.ts n'est même pas inclus dans
 * un build de production. Le test est écrit en ligne, pas via une constante :
 * c'est ce qui permet à webpack de l'évaluer.
 */
export const api: Backend =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? (require("./mock") as typeof import("./mock")).mock : remote;

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Remet les données de démo à zéro (sans effet hors démo). */
export function resetDemoData() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") (require("./mock") as typeof import("./mock")).resetMock();
}
