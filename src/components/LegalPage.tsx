import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";
import { LegalLinks } from "./LegalLinks";
import { Logo } from "./ui";

/** Gabarit commun des pages légales : lisible sur mobile, sans animation. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6">
      <header className="mb-8">
        <Logo href="/" />
      </header>
      <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm font-semibold text-ink/55">Dernière mise à jour : {LEGAL.miseAJour}</p>
      <article className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-ink/80 sm:text-base">{children}</article>
      <footer className="mt-12 border-t border-ink/10 pt-6 text-center">
        <Link href="/" className="text-sm font-bold text-azur hover:underline">
          ← Retour à l&apos;accueil
        </Link>
        <LegalLinks className="mt-4" />
      </footer>
    </main>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="!mt-8 font-display text-xl font-bold text-ink">{children}</h2>;
}
