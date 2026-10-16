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
// seul le GPS est autorisé (demandé par l'appli elle-même). Referrer : les autres
// sites ne reçoivent que l'origine, jamais le chemin (les chemins secrets restent
// secrets) — mais un Referer est bien envoyé, les tuiles OSM l'exigent.
//
// CSP : le jeton de session vit dans le navigateur (l'appli appelle Supabase
// directement). Si un script malveillant s'exécutait un jour, il ne pourrait ni
// charger de code externe ni envoyer le jeton ailleurs que vers les serveurs
// ci-dessous (fetch, WebSocket, beacon, images). 'unsafe-inline' reste
// nécessaire aux scripts inline de Next.js sur des pages statiques (un nonce
// imposerait un rendu serveur à chaque visite).
const dev = process.env.NODE_ENV !== "production";
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();
const ga = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_ID ?? "");
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${ga ? " https://www.googletagmanager.com" : ""}`,
  "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
  "font-src 'self' data: https://api.fontshare.com https://cdn.fontshare.com",
  `img-src 'self' data: blob: https://tile.openstreetmap.org${ga ? " https://*.google-analytics.com https://*.googletagmanager.com" : ""}`,
  [
    "connect-src 'self'",
    supabase && `${supabase} ${supabase.replace(/^http/, "ws")}`,
    ga && "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    dev && "ws: http://localhost:*",
  ]
    .filter(Boolean)
    .join(" "),
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
