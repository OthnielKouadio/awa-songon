import type { MetadataRoute } from "next";

/**
 * Manifeste d'application installable propre à un espace (admin, livreur).
 * Servi SOUS le chemin secret de l'espace (ex. /<ADMIN_PATH>/manifest.webmanifest) :
 * l'appli installée depuis cet espace s'ouvre directement dessus, au lieu de la
 * page d'accueil publique (qui n'a, volontairement, aucun lien vers les espaces).
 */
export function manifestEspace(base: string, nom: string, id: string): MetadataRoute.Manifest {
  return {
    id,
    name: `${nom} — Distribution Eau`,
    short_name: nom,
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7FBFF",
    theme_color: "#F7FBFF",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export const reponseManifest = (m: MetadataRoute.Manifest) =>
  new Response(JSON.stringify(m), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
