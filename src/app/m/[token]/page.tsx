import type { Metadata } from "next";
import { EspaceMaison } from "./EspaceMaison";

const QR = /^[2-9A-HJ-NP-Z]{6}$/;

// Page d'une maison (lien du QR). Jamais indexée : le lien est propre à une porte.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const qr = (await params).token.trim().toUpperCase();
  return {
    title: "Ma maison — Distribution Eau",
    robots: { index: false, follow: false },
    // Appli installée depuis la page de SA maison : elle s'ouvre directement dessus.
    ...(QR.test(qr) ? { manifest: `/m/${qr}/manifest.webmanifest` } : {}),
  };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EspaceMaison qr={token.trim().toUpperCase()} />;
}
