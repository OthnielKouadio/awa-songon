/** @type {import('next').NextConfig} */

// Mode démo : toujours défini (et figé au build) pour que webpack retire mock.ts
// des bundles hors démo — voir src/lib/data-provider.ts.
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? "true" : "false";

// Garde-fou : un build de production en mode démo doit être voulu explicitement
// (ex. un site de démonstration), jamais le résultat d'une variable oubliée.
if (process.env.NODE_ENV === "production" && demoMode === "true" && process.env.ALLOW_DEMO_BUILD !== "true") {
  throw new Error("NEXT_PUBLIC_DEMO_MODE=true refusé pour un build de production (définis ALLOW_DEMO_BUILD=true si c'est voulu).");
}

// En-têtes de sécurité sur toutes les réponses : pas d'affichage dans une iframe
// d'un autre site (faux clics), pas de devinette de type MIME, HTTPS forcé, et
// seul le GPS est autorisé (demandé par l'appli elle-même).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Dossier de sortie séparé possible (ex. build de vérification pendant qu'un `next dev` tourne).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_DEMO_MODE: demoMode },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
