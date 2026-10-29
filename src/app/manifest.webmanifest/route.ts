import { reponseManifest } from "@/lib/manifestEspace";

/**
 * Appli installable publique (familles) : /manifest.webmanifest.
 * Route classique plutôt qu'un fichier app/manifest.ts : un manifeste « fichier »
 * l'emporterait sur celui des espaces admin et livreur, qui doivent pouvoir
 * annoncer leur propre appli (voir src/lib/manifestEspace.ts).
 */
export function GET() {
  return reponseManifest({
    id: "/",
    name: "Distribution Eau — Livraison d'eau",
    short_name: "Distribution Eau",
    description: "Livraison d'eau dans votre cité. Scannez l'autocollant de votre maison et commandez.",
    start_url: "/",
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
  });
}
