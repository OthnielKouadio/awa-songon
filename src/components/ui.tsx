"use client";

import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
    <motion.a whileHover={{ y: -1 }} whileTap={PRESS} transition={SPRING} className={btnClass(variant, size, className)} {...props}>
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
  green: "bg-reprise/10 text-reprise border-reprise",
  orange: "bg-pause/10 text-pause border-pause",
  danger: "bg-danger/10 text-danger border-danger",
} as const;
export type BadgeTone = keyof typeof BADGE;

export function Badge({ tone = "sky", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-0.5 text-xs font-bold ${BADGE[tone]}`}>
      {children}
    </span>
  );
}

// ─── Formulaires ───────────────────────────────────────────────────────────

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-sm text-ink/60">{hint}</span>}
    </label>
  );
}

export function PhoneInput({ value, onChange, required = true }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <input
      className="field"
      type="tel"
      inputMode="numeric"
      maxLength={10}
      autoComplete="tel"
      placeholder="0700000000"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
      required={required}
    />
  );
}

/** Saisie du code maison à 4 chiffres : grands chiffres espacés. */
export function CodeInput({
  value,
  onChange,
  label = "Code maison à 4 chiffres",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      className="field text-center !text-3xl font-bold tracking-[0.6em] placeholder:tracking-[0.6em]"
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      autoComplete="off"
      placeholder="••••"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      aria-label={label}
    />
  );
}

/** Choix « Qui es-tu ? » : 4 gros boutons. */
export const ROLES = [
  { id: "PAPA", label: "Papa" },
  { id: "MAMAN", label: "Maman" },
  { id: "ENFANT", label: "Enfant" },
  { id: "AUTRE", label: "Autre" },
] as const;
export type Role = (typeof ROLES)[number]["id"];
export const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;

export function RolePicker({ value, onChange }: { value: Role | null; onChange: (r: Role) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Qui es-tu ?">
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={value === r.id}
          onClick={() => onChange(r.id)}
          className={`rounded-2xl border-brut border-ink px-4 py-3 text-lg font-bold transition-colors ${
            value === r.id ? "bg-ink text-white" : "bg-white hover:bg-sky"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** 5 étoiles cliquables (ou en lecture seule). */
export function Stars({ value, onChange, size = 40 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-1" role={onChange ? "radiogroup" : "img"} aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
              fill={n <= value ? "#0096FF" : "#fff"}
              stroke="#0A1931"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="transition-transform active:scale-90">
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

// ─── Modal (feuille qui monte sur mobile) ──────────────────────────────────

export function Modal({ open, onClose, children, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
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
        <motion.div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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

export function ModalTitle({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="title-md">{children}</h2>
      <CloseButton onClick={onClose} />
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Fermer" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-brut border-ink bg-white transition-colors hover:bg-sky">
      <Icon name="close" size={18} />
    </button>
  );
}

type ConfirmOpts = { title?: string; confirmLabel?: string; danger?: boolean };
type ConfirmState = ConfirmOpts & { message: ReactNode; resolve: (v: boolean) => void };

/** Remplace window.confirm() : `if (await confirm("Supprimer ?")) …`. Rendre `dialog` une fois dans la page. */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const confirm = useCallback(
    (message: ReactNode, opts: ConfirmOpts = {}) => new Promise<boolean>((resolve) => setState({ ...opts, message, resolve })),
    []
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal open={!!state} onClose={() => close(false)}>
      {state && (
        <>
          <ModalTitle onClose={() => close(false)}>{state.title ?? "Confirmer"}</ModalTitle>
          <div className="text-lg leading-relaxed">{state.message}</div>
          <div className="mt-6 flex gap-3">
            <Btn variant="white" className="flex-1" onClick={() => close(false)}>
              Annuler
            </Btn>
            <Btn variant={state.danger ? "danger" : "ink"} className="flex-1" onClick={() => close(true)}>
              {state.confirmLabel ?? "Confirmer"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
  return { confirm, dialog };
}

// ─── Divers ────────────────────────────────────────────────────────────────

export function Spinner({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 font-semibold text-ink/70" role="status">
      <motion.span className="text-azur" animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}>
        <Icon name="drop" size={26} fill />
      </motion.span>
      {label}…
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-2xl border-brut border-danger bg-white px-4 py-3 font-semibold text-danger">
      {children}
    </motion.div>
  );
}

export function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-2xl border-brut border-reprise bg-white px-4 py-3 font-semibold text-reprise">
      {children}
    </div>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Distribution Eau" className="flex shrink-0 items-center gap-2.5">
      <span className="grid h-11 w-11 place-items-center rounded-xl border-brut border-ink bg-sky text-azur shadow-hard-sm">
        <Icon name="drop" size={24} fill />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">
        Distribution<span className="ml-1.5 text-ink/40">Eau</span>
      </span>
    </Link>
  );
}

// ─── Admin : tableau simple ─────────────────────────────────────────────────

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border-brut border-ink bg-white">
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`border-b-2 border-ink bg-mist px-3 py-3 text-xs font-bold uppercase tracking-wide text-ink/60 ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-ink/10 px-3 py-3 align-middle ${className}`}>{children}</td>;
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
      className={`inline-flex items-center gap-1 rounded-lg border-[1.5px] px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}
