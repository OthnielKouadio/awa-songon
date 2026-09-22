import { mock } from "./mock";
import { remote } from "./remote";
import { isSupabaseConfigured } from "./supabase";
import type { Backend } from "./types";

/**
 * Point d'entrée unique de l'app.
 * - Supabase configuré (.env)  → vraie base + Realtime
 * - Sinon                      → mode démo en localStorage, 100 % fonctionnel
 */
export const api: Backend = isSupabaseConfigured ? remote : mock;

/** True quand l'app tourne sur les données locales (aucune variable d'environnement). */
export const isDemo = !isSupabaseConfigured;
