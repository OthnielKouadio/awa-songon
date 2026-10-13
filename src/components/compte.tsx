"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, PinInput } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { ALERTE_FIN_ESSAI_JOURS, dateLongue, enEssai, formatFcfa, joursRestants, RECHARGE_MIN_FCFA } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

/** Badge « Essai gratuit » pendant l'essai du compte, sinon rien (l'appelant
 *  affiche alors statut + solde). */
export function EssaiBadge({ fin }: { fin: string | null }) {
  return enEssai(fin) ? <Badge tone="sky">Essai gratuit</Badge> : null;
}

/** Prévient dans les derniers jours de l'essai : après, il faudra recharger. */
export function FinEssaiBanner({ fin, depot }: { fin: string | null; depot: string | null }) {
  if (!fin || !enEssai(fin)) return null;
  const jours = joursRestants(fin);
  if (jours > ALERTE_FIN_ESSAI_JOURS) return null;
  return (
    <div role="status" className="rounded-2xl border-brut border-ink bg-sky p-4">
      <p className="flex items-center gap-2 font-bold text-ink">
        <Icon name="clock" size={18} className="text-azur" />
        Ton essai gratuit se termine {jours <= 1 ? "demain" : `dans ${jours} jours`} ({dateLongue(fin.slice(0, 10))}).
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink/70">
        Pour continuer ensuite, recharge ton compte par Wave au <strong>{depot ? formatPhone(depot) : "…"}</strong> (minimum{" "}
        {formatFcfa(RECHARGE_MIN_FCFA)}).
      </p>
    </div>
  );
}

/** Après un code provisoire donné par l'admin : choix obligatoire d'un nouveau code. */
export function ChangerPinObligatoire({ onSubmit }: { onSubmit: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 4) return setError("Ton code doit faire 4 chiffres.");
    if (pin !== pin2) return setError("Les deux codes ne sont pas identiques.");
    setBusy(true);
    try {
      await onSubmit(pin);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="brut space-y-5 p-5">
      <div>
        <p className="title-md">Choisis ton nouveau code</p>
        <p className="mt-1 text-sm font-medium text-ink/60">Tu t&apos;es connecté avec un code provisoire. Choisis maintenant ton propre code à 4 chiffres.</p>
      </div>
      <Field label="Nouveau code PIN">
        <PinInput value={pin} onChange={setPin} autoComplete="new-password" />
      </Field>
      <Field label="Confirme-le">
        <PinInput value={pin2} onChange={setPin2} autoComplete="new-password" />
      </Field>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || pin.length !== 4 || pin2.length !== 4}>
        {busy ? "Un instant…" : "Enregistrer mon code"}
      </Btn>
    </form>
  );
}
