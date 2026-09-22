"use client";

import { AnimatePresence, animate, motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CompteStatut } from "@/lib/types";
import { Icon } from "./icons";

// ─── Boutons ───────────────────────────────────────────────────────────────

const VARIANTS = {
  ink: "bg-ink text-white hover:bg-azur",
  azur: "bg-azur text-white hover:bg-ink",
  white: "bg-white text-ink hover:bg-sky",
  danger: "bg-white text-danger border-danger hover:bg-danger hover:text-white",
} as const;

type Variant = keyof typeof VARIANTS;

const btnClass = (variant: Variant, size: "md" | "lg", extra: string) =>
  `inline-flex items-center justify-center gap-2 border-brut border-ink rounded-2xl font-bold
   shadow-hard-sm select-none transition-colors duration-200
   disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-inherit
   ${size === "lg" ? "px-6 py-4 text-lg" : "px-4 py-2.5 text-base"} ${VARIANTS[variant]} ${extra}`;

const PRESS = { x: 3, y: 3, boxShadow: "0px 0px 0px #0A1931" };
const SPRING = { type: "spring", stiffness: 500, damping: 32 } as const;

type BtnProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  size?: "md" | "lg";
  children: ReactNode;
};

/** Bouton qui "s'enfonce" doucement dans son ombre. */
export function Btn({ variant = "ink", size = "md", className = "", children, ...props }: BtnProps) {
  return (
    <motion.button
      whileHover={props.disabled ? undefined : { y: -1 }}
      whileTap={props.disabled ? undefined : PRESS}
      transition={SPRING}
      className={btnClass(variant, size, className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

type LinkBtnProps = Omit<HTMLMotionProps<"a">, "children"> & {
  variant?: Variant;
  size?: "md" | "lg";
  children: ReactNode;
};

/** Même look que Btn, mais un vrai lien (tel:, https://…). */
export function LinkBtn({ variant = "white", size = "md", className = "", children, ...props }: LinkBtnProps) {
  return (
    <motion.a
      whileHover={{ y: -1 }}
      whileTap={PRESS}
      transition={SPRING}
      className={btnClass(variant, size, className)}
      {...props}
    >
      {children}
    </motion.a>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────

const BADGE = {
  sky: "bg-sky text-azur border-azur",
  azur: "bg-azur text-white border-azur",
  ink: "bg-ink text-white border-ink",
  gray: "bg-steel/50 text-ink/70 border-steel",
  danger: "bg-danger/10 text-danger border-danger",
} as const;

export function Badge({
  tone = "sky",
  children,
  className = "",
}: {
  tone?: keyof typeof BADGE;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 text-xs font-bold uppercase tracking-wide ${BADGE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const STATUT_TONE: Record<CompteStatut, keyof typeof BADGE> = { PAYE: "azur", IMPAYE: "gray", BLOQUE: "danger" };
const STATUT_TEXT: Record<CompteStatut, string> = { PAYE: "Payé", IMPAYE: "Impayé", BLOQUE: "Bloqué" };

/** Badge de statut de compte (géré uniquement par l'admin). */
export function StatutBadge({ statut }: { statut: CompteStatut }) {
  return (
    <Badge tone={STATUT_TONE[statut]}>
      {statut === "BLOQUE" && <Icon name="lock" size={12} />}
      {STATUT_TEXT[statut]}
    </Badge>
  );
}

/** Pastille qui pulse doucement (état "en route", "live"…). */
export function PulseDot({ color = "#0096FF", pulse = true }: { color?: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
        />
      )}
      <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

// ─── Compteur qui tourne ───────────────────────────────────────────────────

export function Counter({
  value,
  duration = 0.8,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const controls = animate(from.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return <span className="tabular-nums">{format ? format(shown) : shown}</span>;
}

// ─── Champs ────────────────────────────────────────────────────────────────

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-ink/60">{hint}</span>}
    </label>
  );
}

// ─── Modal (feuille qui monte sur mobile) ──────────────────────────────────

export function Modal({
  open,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-brut border-brut border-b-0 border-ink bg-paper p-6 sm:rounded-b-brut sm:border-b-2 sm:shadow-hard ${
              wide ? "sm:max-w-3xl" : "sm:max-w-lg"
            }`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Fermer"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-brut border-ink bg-white transition-colors hover:bg-sky"
    >
      <Icon name="close" size={18} />
    </button>
  );
}

// ─── Divers ────────────────────────────────────────────────────────────────

export function Spinner({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 font-semibold text-ink/70" role="status">
      <motion.span
        className="text-azur"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}
      >
        <Icon name="drop" size={26} fill />
      </motion.span>
      {label}…
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="rounded-2xl border-brut border-danger bg-white px-4 py-3 font-semibold text-danger"
    >
      {children}
    </motion.div>
  );
}

/** Numéro d'étape : cercle bleu, chiffre blanc. */
export function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-azur font-display text-lg font-bold text-white">
      {n}
    </span>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="AWA SONGON" className="flex items-center gap-2.5">
      <span className="grid h-11 w-11 place-items-center rounded-xl border-brut border-ink bg-sky text-azur shadow-hard-sm">
        <Icon name="drop" size={24} fill />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">
        AWA<span className="text-ink/40"> SONGON</span>
      </span>
    </Link>
  );
}

/** Interrupteur à bascule (bleu = actif). */
export function Toggle({
  on,
  onToggle,
  label,
  hint,
}: {
  on: boolean;
  onToggle: () => void;
  label: ReactNode;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink/40 px-4 py-3 text-left transition-colors hover:border-azur hover:bg-sky/50"
    >
      <span className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors duration-200 ${on ? "bg-azur" : "bg-white"}`}>
        <motion.span
          className={`absolute top-0.5 h-5 w-5 rounded-full ${on ? "bg-white" : "bg-ink"}`}
          animate={{ left: on ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        />
      </span>
      <span className="text-sm font-semibold sm:text-base">
        {label}
        {hint && <span className="block text-xs font-medium text-ink/55">{hint}</span>}
      </span>
    </button>
  );
}

/** Saisie de code à 4 chiffres (PIN), grands chiffres espacés. */
export function PinInput({
  value,
  onChange,
  autoComplete,
  label = "Code PIN à 4 chiffres",
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  label?: string;
}) {
  return (
    <input
      className="field text-center !text-3xl font-bold tracking-[0.6em] placeholder:tracking-[0.6em]"
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      autoComplete={autoComplete}
      placeholder="••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      aria-label={label}
    />
  );
}

// ─── Admin : tableau simple ─────────────────────────────────────────────────

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border-brut border-ink">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="border-b-2 border-ink bg-mist px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink/60">{children}</th>;
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-ink/10 px-4 py-3 align-middle ${className}`}>{children}</td>;
}

/** Bouton compact pour les actions de tableau (admin). */
export function TableBtn({
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "danger" | "azur";
  disabled?: boolean;
}) {
  const cls =
    tone === "danger"
      ? "border-danger text-danger hover:bg-danger hover:text-white"
      : tone === "azur"
      ? "border-azur text-azur hover:bg-azur hover:text-white"
      : "border-ink hover:bg-ink hover:text-white";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border-[1.5px] px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}
