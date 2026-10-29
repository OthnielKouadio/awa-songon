import type { Metadata } from "next";
import { NoterLivraison } from "./NoterLivraison";

export const metadata: Metadata = { title: "Noter ma livraison — Distribution Eau", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, { m }] = await Promise.all([params, searchParams]);
  return <NoterLivraison commandeId={id} qr={typeof m === "string" ? m.toUpperCase() : null} />;
}
