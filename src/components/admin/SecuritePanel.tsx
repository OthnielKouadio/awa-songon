"use client";

import { useState } from "react";
import { api, isDemo } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { resetMock } from "@/lib/mock";
import type { Creds } from "@/lib/types";
import { useConfirm } from "../CustomModal";
import { Icon } from "../icons";
import { Btn, ErrorBox, Field } from "../ui";
import { Panel } from "./shared";

export default function SecuritePanel({ creds, reload }: { creds: Creds; reload: () => Promise<void> }) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [nouveau, setNouveau] = useState("");
  const [confirme, setConfirme] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    if (nouveau.length < 6) return setError("Choisis un mot de passe d'au moins 6 caractères.");
    if (nouveau !== confirme) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    try {
      await api.admin.changerMotDePasse(creds, nouveau);
      setOk(true);
      setNouveau("");
      setConfirme("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Sécurité">
      <p className="mb-5 max-w-lg text-sm font-medium text-ink/60">
        Numéro admin : <strong>{creds.tel}</strong>. Si tu utilises encore le mot de passe par défaut (<code>admin123</code>), change-le maintenant.
      </p>
      <form onSubmit={submit} className="max-w-sm space-y-5">
        <Field label="Nouveau mot de passe">
          <input className="field" type="password" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} required />
        </Field>
        <Field label="Confirme-le">
          <input className="field" type="password" autoComplete="new-password" value={confirme} onChange={(e) => setConfirme(e.target.value)} required />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        {ok && (
          <p className="flex items-center gap-1.5 font-semibold text-azur">
            <Icon name="check" size={16} /> Mot de passe changé.
          </p>
        )}
        <Btn type="submit" variant="ink" disabled={busy || !nouveau || !confirme}>
          {busy ? "Un instant…" : "Changer le mot de passe"}
        </Btn>
      </form>

      {isDemo && (
        <div className="mt-8 max-w-sm border-t-2 border-ink/10 pt-6">
          <p className="mb-3 text-sm font-medium text-ink/60">
            Mode démo : remet les cités, sources, chauffeurs, clients et commandes à leur état d&apos;origine (efface tes propres essais, y compris ce compte admin — mot de passe <code>admin123</code>).
          </p>
          <Btn
            variant="danger"
            onClick={async () => {
              const ok = await confirm("Tu seras déconnecté.", { title: "Réinitialiser toutes les données de démo ?", danger: true, confirmLabel: "Réinitialiser" });
              if (!ok) return;
              resetMock();
              void reload();
            }}
          >
            Réinitialiser les données de démo
          </Btn>
        </div>
      )}
      {ConfirmDialog}
    </Panel>
  );
}
