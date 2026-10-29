/**
 * Chemins secrets (V2) — CÔTÉ SERVEUR UNIQUEMENT (middleware, layouts serveur,
 * routes API). Ne jamais importer depuis un composant "use client" : les
 * chemins ne doivent pas finir dans le JavaScript public.
 *
 *   ADMIN_PATH / ADMIN_LOGIN_PATH → admin                  cockpit (2FA exigée en base)
 *   DRIVER_PATH                   → livreur                espace livreur
 *   DRIVER_SIGNUP_PATH            → recrutement-chauffeur  inscription des livreurs recrutés
 *
 * Quand un chemin secret est défini, le dossier réel correspondant répond 404.
 * Sans variable (développement), le dossier réel reste accessible.
 */
export const INTERNE = { admin: "admin", livreur: "livreur", recrutement: "recrutement-chauffeur" } as const;
export type Espace = keyof typeof INTERNE;

const RESERVES = new Set(["admin", "livreur", "recrutement-chauffeur", "m", "avis", "avis-plateforme", "suivi", "login", "inscription", "cgu", "confidentialite", "api", "_next", "icons"]);
const SUR = /^[A-Za-z0-9_-]{8,64}$/;
const valide = (p: string | undefined) => (p && SUR.test(p) && !RESERVES.has(p.toLowerCase()) ? p : null);

/** Références statiques à process.env : nécessaires pour le runtime edge du middleware. */
export function cheminsSecrets() {
  return {
    admin: valide(process.env.ADMIN_PATH),
    adminLogin: valide(process.env.ADMIN_LOGIN_PATH),
    livreur: valide(process.env.DRIVER_PATH),
    recrutement: valide(process.env.DRIVER_SIGNUP_PATH),
  };
}

/** URL publique de chaque espace (« /<secret> », ou le dossier réel sans secret). */
export function basesEspaces() {
  const c = cheminsSecrets();
  return {
    admin: `/${c.admin ?? INTERNE.admin}`,
    livreur: `/${c.livreur ?? INTERNE.livreur}`,
    recrutement: `/${c.recrutement ?? INTERNE.recrutement}`,
  };
}
