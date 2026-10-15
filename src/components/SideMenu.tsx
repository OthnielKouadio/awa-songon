"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { CloseButton } from "@/components/ui";

export type SideMenuItem = { icon: IconName; label: string; hint?: ReactNode; onClick: () => void };

function Item({ icon, label, hint, danger, onClick }: SideMenuItem & { danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border-brut px-4 py-3 text-left font-bold transition-colors ${
        danger ? "border-danger bg-white text-danger hover:bg-danger hover:text-white" : "border-ink bg-white hover:bg-sky"
      }`}
    >
      <Icon name={icon} size={20} className={danger ? "" : "text-azur"} />
      <span>
        {label}
        {hint && <span className="block text-xs font-medium text-ink/55">{hint}</span>}
      </span>
    </button>
  );
}

/** Menu latéral (bouton ☰) des espaces client et chauffeur : entrées propres à
 *  chaque rôle, « Quitter » toujours en bas. */
export default function SideMenu({
  titre,
  sousTitre,
  items,
  children,
  onLogout,
}: {
  /** Nom du titulaire (absent tant que le profil n'est pas chargé). */
  titre?: string;
  sousTitre?: string;
  items: SideMenuItem[];
  /** Réglages affichés sous les entrées (ex. interrupteur GPS) : ne ferment pas le menu. */
  children?: ReactNode;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-brut border-ink bg-white transition-colors hover:bg-sky"
      >
        <Icon name="menu" size={22} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[900]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <motion.nav
              aria-label="Menu"
              className="absolute right-0 top-0 flex h-full w-[min(20rem,85vw)] flex-col gap-3 overflow-y-auto border-l-2 border-ink bg-paper p-5"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="title-md">Menu</p>
                <CloseButton onClick={() => setOpen(false)} />
              </div>

              {titre && (
                <div className="mb-2 flex items-center gap-3 rounded-2xl bg-mist p-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky text-azur">
                    <Icon name="user" size={22} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{titre}</span>
                    {sousTitre && <span className="block truncate text-sm text-ink/55">{sousTitre}</span>}
                  </span>
                </div>
              )}

              {items.map((it) => (
                <Item
                  key={it.label}
                  {...it}
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                />
              ))}

              {children}

              <div className="mt-auto pt-4">
                <Item icon="logout" label="Quitter" danger onClick={onLogout} />
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
