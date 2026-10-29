import type { Metadata } from "next";
import { basesEspaces } from "@/lib/chemins";
import { AdminShell } from "./AdminShell";
import { BasesProvider } from "./Bases";

export const metadata: Metadata = { title: "Admin — Distribution Eau", robots: { index: false, follow: false } };

// Rendu à chaque requête : les chemins secrets viennent de l'environnement.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BasesProvider bases={basesEspaces()}>
      <AdminShell>{children}</AdminShell>
    </BasesProvider>
  );
}
