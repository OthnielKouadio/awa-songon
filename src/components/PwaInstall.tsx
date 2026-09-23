"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { usePwaInstall } from "@/lib/usePwaInstall";
import { Icon } from "./icons";

const DISMISSED_KEY = "awa:pwa-dismissed";

/** Enregistre le service worker (installabilité + cache des fichiers statiques)
 *  et affiche une bannière discrète en haut de l'écran pour installer l'app —
 *  jamais en même temps que le pop-up GPS (qui reste en bas). Monté une fois
 *  dans le layout racine : visible sur toutes les pages tant qu'on n'a pas
 *  installé ou fermé la bannière. */
export default function PwaInstall() {
  const { canInstall, iosHint, installed, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true); // true par défaut : évite un flash avant la lecture localStorage
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // pas grave : l'app reste utilisable sans service worker, juste sans mise en cache
      });
    }
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  async function handleInstall() {
    setInstalling(true);
    const accepted = await install();
    setInstalling(false);
    if (accepted) dismiss();
  }

  const show = !installed && !dismissed && (canInstall || iosHint);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className="fixed inset-x-3 top-3 z-[950] mx-auto max-w-md"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="brut-sm flex items-center gap-3 p-3 shadow-hard-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky text-azur">
              <Icon name="download" size={20} />
            </span>
            {canInstall ? (
              <>
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                  Installe Distribution Eau sur ton téléphone, comme une vraie appli.
                </p>
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="shrink-0 rounded-xl border-brut border-ink bg-ink px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-azur disabled:opacity-50"
                >
                  {installing ? "…" : "Installer"}
                </button>
              </>
            ) : (
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                Pour l&apos;installer : bouton <strong>Partager</strong>{" "}
                <span aria-hidden>⬆️</span> puis <strong>Sur l&apos;écran d&apos;accueil</strong>.
              </p>
            )}
            <button onClick={dismiss} aria-label="Fermer" className="shrink-0 rounded-lg p-1 text-ink/40 hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
