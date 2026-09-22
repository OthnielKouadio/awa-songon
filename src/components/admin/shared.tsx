"use client";

import { motion } from "framer-motion";
import { useCallback, useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/errors";

/** Exécute une écriture, affiche l'erreur éventuelle, puis recharge les données. */
export function useMutation(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async (op: () => Promise<void>) => {
      setBusy(true);
      setError("");
      try {
        await op();
        await reload();
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  return { run, busy, error, setError };
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="brut p-5 sm:p-6">
      <h2 className="title-md mb-5">{title}</h2>
      {children}
    </section>
  );
}

export function Row({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-brut border-ink bg-white px-4 py-3"
    >
      <div className="min-w-0">{children}</div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </motion.li>
  );
}

export function SmallBtn({
  onClick,
  children,
  danger = false,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border-[1.5px] px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-40 ${
        danger
          ? "border-danger text-danger hover:bg-danger hover:text-white"
          : "border-ink bg-white hover:bg-ink hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
