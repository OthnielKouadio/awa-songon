"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./icons";
import { Btn } from "./ui";

/** Petit pop-up custom, affiché avant la vraie demande de permission du navigateur. */
export default function GeoPrompt({
  open,
  onAccept,
  onDismiss,
}: {
  open: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="fixed inset-x-4 bottom-4 z-[900] mx-auto max-w-md"
        >
          <div className="brut bg-white p-5" role="dialog" aria-label="Activer la position">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky text-azur">
                <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}>
                  <Icon name="pin" size={24} />
                </motion.span>
              </span>
              <p className="text-lg font-bold leading-snug">Activer ma position précise pour livraison plus rapide ?</p>
            </div>
            <div className="mt-4 flex gap-3">
              <Btn variant="ink" className="flex-1" onClick={onAccept}>
                Oui, activer
              </Btn>
              <Btn variant="white" className="flex-1" onClick={onDismiss}>
                Non merci
              </Btn>
            </div>
            <p className="mt-3 text-xs font-medium text-ink/60">
              Facultatif : sans GPS, ta commande marche aussi avec ton numéro de lot.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
