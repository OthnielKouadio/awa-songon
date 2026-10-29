import type { Metadata } from "next";
import { basesEspaces } from "@/lib/chemins";
import { LivreurApp } from "./LivreurApp";

// Lien unique pour tous les livreurs (chemin secret DRIVER_PATH). Seuls les
// livreurs créés ou validés par l'admin peuvent se connecter.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Espace livreur — Distribution Eau",
    robots: { index: false, follow: false },
    // Appli installable propre aux livreurs : s'ouvre sur leur espace, pas sur l'accueil public.
    manifest: `${basesEspaces().livreur}/manifest.webmanifest`,
  };
}

export default function Page() {
  return <LivreurApp base={basesEspaces().livreur} />;
}
