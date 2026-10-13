import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = { title: "Statistiques — Distribution Eau" };

export default function StatistiquesLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.className} min-h-dvh bg-white text-slate-900 antialiased`}>{children}</div>;
}
