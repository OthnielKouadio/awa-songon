import type { Metadata } from "next";
import { PrivateBaseProvider } from "@/components/PrivateBase";
import { privatePaths } from "@/lib/private-routes";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Rendu uniquement derrière le middleware (session admin vérifiée) : le chemin
// secret n'est donc transmis qu'à un admin connecté.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PrivateBaseProvider base={`/${privatePaths().admin ?? ""}`}>{children}</PrivateBaseProvider>;
}
