"use client";

import Link from "next/link";
import { COOKIE_PREFS_EVENT, analyticsActive } from "./CookieBanner";

/** Liens de bas de page : CGU, confidentialité et, si une mesure d'audience est
 *  configurée, réglage des cookies (rouvre le bandeau). */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Informations légales" className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-semibold text-ink/55 ${className}`}>
      <Link href="/cgu" className="hover:text-ink hover:underline">
        Conditions d&apos;utilisation
      </Link>
      <Link href="/confidentialite" className="hover:text-ink hover:underline">
        Confidentialité
      </Link>
      {analyticsActive && (
        <button type="button" onClick={() => window.dispatchEvent(new Event(COOKIE_PREFS_EVENT))} className="hover:text-ink hover:underline">
          Cookies
        </button>
      )}
    </nav>
  );
}
