import type { Metadata } from "next";
import { PrivateBaseProvider } from "@/components/PrivateBase";
import { privatePaths } from "@/lib/private-routes";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Rendu uniquement derrière le middleware (session chauffeur vérifiée).
export default function ChauffeurLayout({ children }: { children: React.ReactNode }) {
  return <PrivateBaseProvider base={`/${privatePaths().chauffeur ?? ""}`}>{children}</PrivateBaseProvider>;
}
