import type { Metadata } from "next";
import { Suivi } from "./Suivi";

export const metadata: Metadata = { title: "Suivi de livraison — Distribution Eau", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suivi id={id} />;
}
