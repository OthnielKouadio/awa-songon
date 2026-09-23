import type { MetadataRoute } from "next";

/** Next.js sert automatiquement ce fichier sur /manifest.webmanifest et
 *  l'annonce dans le <head> — pas besoin de <link rel="manifest"> manuel. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Distribution Eau — Livraison d'eau",
    short_name: "Distribution Eau",
    description: "Livraison d'eau par tricycle à Songon. Commande, suis, livre.",
    start_url: "/login",
    scope: "/",
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
