import type { Metadata } from "next";
import { EspaceMaison } from "./EspaceMaison";

// Page d'une maison (lien du QR). Jamais indexée : le lien est propre à une porte.
export const metadata: Metadata = {
  title: "Ma maison — Distribution Eau",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EspaceMaison qr={token.trim().toUpperCase()} />;
}
