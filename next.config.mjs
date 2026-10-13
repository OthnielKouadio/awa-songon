/** @type {import('next').NextConfig} */

// Mode démo : toujours défini (et figé au build) pour que webpack retire mock.ts
// des bundles hors démo — voir src/lib/data-provider.ts.
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? "true" : "false";

// Garde-fou : un build de production en mode démo doit être voulu explicitement
// (ex. un site de démonstration), jamais le résultat d'une variable oubliée.
if (process.env.NODE_ENV === "production" && demoMode === "true" && process.env.ALLOW_DEMO_BUILD !== "true") {
  throw new Error("NEXT_PUBLIC_DEMO_MODE=true refusé pour un build de production (définis ALLOW_DEMO_BUILD=true si c'est voulu).");
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_DEMO_MODE: demoMode },
};

export default nextConfig;
