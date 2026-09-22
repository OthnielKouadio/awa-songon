"use client";

import { useCallback, useState, type ReactNode } from "react";
import { CloseButton, Modal } from "./ui";

/** Bouton pilule (rounded-full) réservé au CustomModal — le reste de l'appli
 *  garde le Btn habituel (rounded-2xl) ; c'est la forme demandée ici précisément. */
function PillBtn({
  variant = "primary",
  children,
  ...props
}: { variant?: "primary" | "secondary" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls =
    variant === "primary"
      ? "bg-ink text-white hover:bg-azur"
      : variant === "danger"
      ? "bg-white text-danger border-danger hover:bg-danger hover:text-white"
      : "bg-white text-ink hover:bg-sky";
  return (
    <button
      {...props}
      className={`flex-1 rounded-full border-brut border-ink px-5 py-3 text-center font-bold shadow-hard-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

/** Modal réutilisable : fond mist, bordure 2px, coins 24px (via .brut) — jamais
 *  de window.alert/confirm natif dans l'appli. */
export function CustomModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="-m-6 rounded-brut bg-mist p-6">
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="title-md">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </Modal>
  );
}

type ConfirmOpts = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ConfirmState = ConfirmOpts & { message: string; resolve: (v: boolean) => void };

/** Remplace window.confirm() : `await confirm("Supprimer X ?")` → Promise<boolean>.
 *  Rendre `<ConfirmDialog />` une fois quelque part dans le composant appelant. */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, opts: ConfirmOpts = {}) => {
    return new Promise<boolean>((resolve) => setState({ message, resolve, ...opts }));
  }, []);

  function answer(v: boolean) {
    state?.resolve(v);
    setState(null);
  }

  const ConfirmDialog = (
    <CustomModal open={!!state} onClose={() => answer(false)} title={state?.title ?? "Confirmer"}>
      <p className="whitespace-pre-line font-medium text-ink/75">{state?.message}</p>
      <div className="mt-6 flex gap-3">
        <PillBtn variant="secondary" onClick={() => answer(false)}>
          {state?.cancelLabel ?? "Annuler"}
        </PillBtn>
        <PillBtn variant={state?.danger ? "danger" : "primary"} onClick={() => answer(true)}>
          {state?.confirmLabel ?? "Confirmer"}
        </PillBtn>
      </div>
    </CustomModal>
  );

  return { confirm, ConfirmDialog };
}
