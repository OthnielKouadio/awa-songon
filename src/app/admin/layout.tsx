import type { Metadata } from "next";
import { basesEspaces } from "@/lib/chemins";
import { AdminShell } from "./AdminShell";
import { BasesProvider } from "./Bases";

// Rendu à chaque requête : les chemins secrets viennent de l'environnement.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Admin — Distribution Eau",
    robots: { index: false, follow: false },
    // Appli installable propre à l'admin : s'ouvre sur le cockpit, pas sur l'accueil public.
    manifest: `${basesEspaces().admin}/manifest.webmanifest`,
  };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BasesProvider bases={basesEspaces()}>
      <AdminShell>{children}</AdminShell>
    </BasesProvider>
  );
}
