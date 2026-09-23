"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Icon, type IconName } from "./icons";

/** Petite notification flottante en bas d'écran (ex : bonus fidélité gagné).
 *  Se ferme toute seule après `duration` ms (géré par l'appelant). */
export function Toast({ open, icon = "check", children }: { open: boolean; icon?: IconName; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 40, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 40, x: "-50%" }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-6 left-1/2 z-[1200] flex max-w-[92vw] items-center gap-2.5 rounded-full border-brut border-ink bg-ink px-5 py-3.5 text-white shadow-hard"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-azur">
            <Icon name={icon} size={16} />
          </span>
          <span className="font-bold">{children}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
