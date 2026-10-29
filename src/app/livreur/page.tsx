import type { Metadata } from "next";
import { basesEspaces } from "@/lib/chemins";
import { LivreurApp } from "./LivreurApp";

// Lien unique pour tous les livreurs : awa-songon.vercel.app/livreur. Seuls les livreurs
// créés par l'admin (avec un code d'accès) peuvent se connecter.
export const metadata: Metadata = { title: "Espace livreur — Distribution Eau", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default function Page() {
  return <LivreurApp base={basesEspaces().livreur} />;
}
