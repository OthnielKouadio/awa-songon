"use client";

import { useState } from "react";
import { CustomModal } from "@/components/CustomModal";
import { Icon } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, LinkBtn, PinInput } from "@/components/ui";
import { errorMessage, MESSAGES } from "@/lib/errors";
import { pinTropSimple } from "@/lib/pin";
import {
  ALERTE_FIN_ESSAI_JOURS,
  COUT_COMMANDE_CLIENT,
  dateLongue,
  enEssai,
  formatFcfa,
  formatPoints,
  joursRestants,
  POINTS_PAR_LIVRAISON,
  RECHARGE_MIN_FCFA,
  RECHARGE_MULTIPLE,
  RECHARGE_MULTIPLE_CLIENT,
  SOLDE_MIN,
  SOLDE_MIN_CLIENT,
  WAVE_PAY_URL,
} from "@/lib/format";
import { callLink, formatPhone } from "@/lib/phone";
import { useWaveMarchand } from "@/lib/useWaveMarchand";

/** Badge « Essai gratuit » pendant l'essai du compte, sinon rien (l'appelant
 *  affiche alors statut + solde). */
export function EssaiBadge({ fin }: { fin: string | null }) {
  return enEssai(fin) ? <Badge tone="sky">Essai gratuit</Badge> : null;
}

/** Ouvre le paiement Wave marchand (sans frais pour le client). Lien fixé dans
 *  le code et vérifié (WAVE_PAY_URL) : rien ne s'affiche s'il est invalide. */
export function PayerWaveBtn({ variant = "azur", className = "" }: { variant?: "azur" | "ink" | "white"; className?: string }) {
  if (!WAVE_PAY_URL) return null;
  return (
    <LinkBtn href={WAVE_PAY_URL} target="_blank" rel="noopener noreferrer" variant={variant} size="lg" className={`w-full ${className}`}>
      <Icon name="money" size={20} /> Payer avec Wave
    </LinkBtn>
  );
}

/** Anti-arnaque : le client vérifie le marchand sur l'écran Wave avant de valider. */
export function VerifMarchand({ className = "" }: { className?: string }) {
  const marchand = useWaveMarchand();
  return (
    <p className={`flex items-start gap-1.5 text-xs font-medium text-ink/60 ${className}`}>
      <Icon name="shield" size={14} className="mt-0.5 text-azur" />
      <span>
        Sans frais pour toi. Sur l&apos;écran Wave, vérifie que le marchand est <strong className="text-ink">« {marchand} »</strong> avant de valider.
      </span>
    </p>
  );
}

/** Prévient dans les derniers jours de l'essai : après, il faudra recharger. */
export function FinEssaiBanner({ fin, min = RECHARGE_MIN_FCFA }: { fin: string | null; min?: number }) {
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
        Pour continuer ensuite, recharge ton compte avec Wave, sans frais (minimum {formatFcfa(min)})
        {WAVE_PAY_URL && (
          <>
            {" "}:{" "}
            <a href={WAVE_PAY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-azur underline-offset-2 hover:underline">
              payer avec Wave
            </a>
          </>
        )}
        .
      </p>
    </div>
  );
}

/** Règles de recharge propres à chaque rôle. */
const RECHARGE = {
  client: {
    cout: COUT_COMMANDE_CLIENT,
    unite: "commande",
    bloque: SOLDE_MIN_CLIENT,
    // Seuil des badges de solde (dashboard client) : 3 commandes.
    alerte: SOLDE_MIN_CLIENT * 3,
    montant: `au moins ${formatFcfa(RECHARGE_MULTIPLE_CLIENT)} (1 commande). Tu peux aussi payer 200, 300, 500… : un montant rond en centaines.`,
    exemple: 500,
  },
  chauffeur: {
    cout: POINTS_PAR_LIVRAISON,
    unite: "livraison",
    bloque: SOLDE_MIN,
    // Seuil du badge de solde (espace chauffeur) : 4 livraisons.
    alerte: SOLDE_MIN * 4,
    montant: `au moins ${formatFcfa(RECHARGE_MIN_FCFA)}, par tranche de ${formatFcfa(RECHARGE_MULTIPLE)} (1 000, 1 050, 1 500…).`,
    exemple: RECHARGE_MIN_FCFA,
  },
} as const;

/** Détails pour recharger ses points par Wave (menu client ou chauffeur) : il peut
 *  recharger avant d'atteindre le seuil de blocage plutôt que d'attendre d'être bloqué. */
export function RechargeModal({
  role,
  open,
  onClose,
  depot,
  soldePoints,
  essaiFin,
  tel,
}: {
  role: keyof typeof RECHARGE;
  open: boolean;
  onClose: () => void;
  depot: string | null;
  soldePoints: number;
  essaiFin: string | null;
  /** Numéro du titulaire : c'est ce compte qui sera crédité. */
  tel: string;
}) {
  const r = RECHARGE[role];
  const essai = enEssai(essaiFin);
  const restantes = Math.floor(Math.max(0, soldePoints) / r.cout);
  const bas = !essai && soldePoints < r.alerte;

  return (
    <CustomModal open={open} onClose={onClose} title="Recharger mes points">
      <div className="space-y-4">
        <div className={`rounded-2xl border-brut p-4 ${bas ? "border-danger bg-danger/10" : "border-ink bg-white"}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/50">Mon solde</p>
          {essai ? (
            <p className="mt-0.5 font-medium text-ink/70">
              <strong className="text-ink">Essai gratuit</strong> jusqu&apos;au {dateLongue(essaiFin!.slice(0, 10))} : rien n&apos;est débité. Tu peux déjà recharger
              pour la suite.
            </p>
          ) : (
            <>
              <p className={`font-display text-2xl font-bold ${bas ? "text-danger" : ""}`}>{formatPoints(soldePoints)}</p>
              <p className="text-sm font-medium text-ink/60">
                {restantes === 0 ? `Plus assez pour une ${r.unite}.` : `De quoi faire ${restantes} ${r.unite}${restantes > 1 ? "s" : ""}.`}
                {soldePoints < r.bloque ? " Ton compte reste bloqué jusqu'à ta recharge." : bas && " Recharge vite pour ne pas être bloqué."}
              </p>
            </>
          )}
        </div>

        <div>
          <PayerWaveBtn />
          <VerifMarchand className="mt-2" />
        </div>

        <ol className="space-y-2.5 text-sm font-medium text-ink/75">
          <li>
            <strong className="text-ink">1.</strong> Touche « Payer avec Wave » et paie {r.montant}
          </li>
          <li>
            <strong className="text-ink">2.</strong> Paie depuis ton numéro <strong className="text-ink">{formatPhone(tel)}</strong> : c&apos;est lui qui permet de
            créditer ton compte. Depuis un autre numéro, appelle le dépôt pour le signaler.
          </li>
          <li>
            <strong className="text-ink">3.</strong> Tes points sont ajoutés dès que le paiement est vérifié : 1 FCFA = 1 point, {formatPoints(r.cout)} par {r.unite}{" "}
            (ex. {formatFcfa(r.exemple)} = {r.exemple / r.cout} {r.unite}s).
          </li>
        </ol>

        {depot && (
          <LinkBtn href={callLink(depot)} variant="white" className="w-full">
            <Icon name="phone" size={18} className="text-azur" /> Un souci ? Appeler le dépôt
          </LinkBtn>
        )}
      </div>
    </CustomModal>
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
    if (pinTropSimple(pin)) return setError(MESSAGES.PIN_TROP_SIMPLE);
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
