"use client";

import { useEffect, useState } from "react";

/** Évènement non standard (pas dans lib.dom.d.ts) déclenché par Chrome/Edge/Android
 *  quand l'app remplit les critères d'installation (manifest + service worker). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** window.__awaBip est rempli par le script inline de layout.tsx, qui écoute
 *  beforeinstallprompt DÈS le chargement de la page — avant même l'hydratation
 *  React. Sans ça, un beforeinstallprompt déclenché tôt par Chrome serait perdu :
 *  l'évènement n'est jamais rejoué pour un listener attaché après coup. */
declare global {
  interface Window {
    __awaBip: BeforeInstallPromptEvent | null;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari : pas de matchMedia standard, propriété dédiée
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Détecte iOS Safari, qui ne déclenche jamais beforeinstallprompt : l'installation
 *  n'y est possible que via Partager → Sur l'écran d'accueil (aucune API pour l'automatiser). */
function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    if (window.__awaBip) setDeferred(window.__awaBip); // déjà capturé avant l'hydratation
    const onReady = () => window.__awaBip && setDeferred(window.__awaBip);
    window.addEventListener("awa:bip-ready", onReady);

    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      window.__awaBip = null;
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("awa:bip-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    window.__awaBip = null;
    return outcome === "accepted";
  }

  return {
    /** Chrome/Edge/Android : un vrai prompt natif est disponible. */
    canInstall: !!deferred && !installed,
    /** iOS Safari : jamais de prompt natif, juste des instructions. */
    iosHint: ios && !installed && !deferred,
    installed,
    install,
  };
}
