"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const KEY = "awa:consent";
export const COOKIE_PREFS_EVENT = "awa:cookies";

/** Une mesure d'audience n'est chargée que si NEXT_PUBLIC_GA_ID est défini. Sans
 *  elle, l'appli n'utilise que des stockages indispensables (session, préférences) :
 *  pas de consentement à demander, donc pas de bandeau. */
export const analyticsActive = Boolean(GA_ID && /^G-[A-Z0-9]+$/.test(GA_ID));

type Consent = "accepte" | "refuse";

function lire(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "accepte" || v === "refuse" ? v : null;
  } catch {
    return null;
  }
}

export default function CookieBanner() {
  // undefined = pas encore lu (rendu serveur / 1er rendu) : rien n'est affiché.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);

  useEffect(() => {
    if (!analyticsActive) return;
    setConsent(lire());
    const rouvrir = () => setConsent(null);
    window.addEventListener(COOKIE_PREFS_EVENT, rouvrir);
    return () => window.removeEventListener(COOKIE_PREFS_EVENT, rouvrir);
  }, []);

  if (!analyticsActive) return null;

  function choisir(v: Consent) {
    const avant = lire();
    try {
      localStorage.setItem(KEY, v);
    } catch {}
    // Retrait du consentement : gtag est déjà chargé dans cette page, on
    // recharge pour repartir sans lui.
    if (avant === "accepte" && v === "refuse") return window.location.reload();
    setConsent(v);
  }

  return (
    <>
      {consent === "accepte" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {consent === null && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookies"
          className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border-brut border-ink bg-white p-4 shadow-hard sm:flex-row sm:items-center sm:gap-5 sm:p-5">
            <p className="text-sm font-medium leading-snug text-ink/80">
              Nous utilisons des cookies de mesure d&apos;audience pour améliorer le service, uniquement avec ton accord.{" "}
              <Link href="/confidentialite" className="font-bold text-azur underline">
                En savoir plus
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => choisir("refuse")}
                className="flex-1 rounded-xl border-brut border-ink bg-white px-4 py-2.5 text-sm font-bold text-ink sm:flex-none"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={() => choisir("accepte")}
                className="flex-1 rounded-xl border-brut border-ink bg-azur px-4 py-2.5 text-sm font-bold text-white sm:flex-none"
              >
                Accepter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
