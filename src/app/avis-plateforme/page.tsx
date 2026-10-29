import type { Metadata } from "next";
import { AvisPlateforme } from "./AvisPlateforme";

export const metadata: Metadata = { title: "Ton avis sur Distribution Eau", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return <AvisPlateforme qr={typeof m === "string" ? m.toUpperCase() : null} />;
}
