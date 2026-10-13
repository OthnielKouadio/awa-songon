"use client";

import { motion } from "framer-motion";
import { useCallback, useState, type ReactNode } from "react";
import { api } from "@/lib/data-provider";
import { errorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import type { Creds } from "@/lib/types";
import { CustomModal, useConfirm } from "../CustomModal";
import { Icon } from "../icons";

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

/** Recherche dans une liste de comptes : par numéro (chiffres, n'importe quelle
 *  écriture : 07…, +225…) ou par nom. */
export function correspond(compte: { nom: string; telephone: string }, recherche: string) {
  const q = recherche.trim();
  if (!q) return true;
  const chiffres = normalizePhone(q);
  if (chiffres && /^[0-9+\s-]+$/.test(q)) return compte.telephone.includes(chiffres.replace(/^0/, "")) || compte.telephone.includes(chiffres);
  return compte.nom.toLowerCase().includes(q.toLowerCase());
}

export function RechercheCompte({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mb-4 max-w-sm">
      <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/45" />
      <input
        className="field !pl-10"
        type="search"
        placeholder="Rechercher par numéro ou nom"
        aria-label="Rechercher par numéro ou nom"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Code oublié : génère un code provisoire et l'affiche UNE fois, à dicter au
 *  téléphone après avoir vérifié l'identité de la personne. */
export function useCodeProvisoire(creds: Creds, reload: () => Promise<void>) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [code, setCode] = useState<{ nom: string; pin: string } | null>(null);
  const [error, setError] = useState("");

  const generer = useCallback(
    async (table: "tricycles" | "clients", id: string, nom: string) => {
      const ok = await confirm("Vérifie d'abord son identité au téléphone. Son ancien code ne marchera plus et il sera déconnecté.", {
        title: `Donner un code provisoire à ${nom} ?`,
        confirmLabel: "Générer le code",
      });
      if (!ok) return;
      setError("");
      try {
        const pin = await api.admin.reinitialiserPin(creds, table, id);
        setCode({ nom, pin });
        await reload();
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [confirm, creds, reload]
  );

  const dialog = (
    <>
      {ConfirmDialog}
      <CustomModal open={!!code} onClose={() => setCode(null)} title="Code provisoire">
        {code && (
          <div className="space-y-4">
            <p className="font-medium text-ink/70">Dicte ce code à {code.nom}. À sa prochaine connexion, l&apos;appli lui demandera d&apos;en choisir un nouveau.</p>
            <p className="rounded-2xl border-brut border-ink bg-sky py-4 text-center font-display text-4xl font-bold tracking-[0.4em]">{code.pin}</p>
            <p className="text-sm font-medium text-ink/55">Ce code ne sera plus affiché une fois cette fenêtre fermée.</p>
          </div>
        )}
      </CustomModal>
    </>
  );

  return { generer, dialog, error };
}
