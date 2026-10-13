"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/admin/shared";
import { Icon } from "@/components/icons";
import { usePrivateBase } from "@/components/PrivateBase";
import { Badge, Btn, ErrorBox, Field, Logo, PhoneInput, Spinner } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { AppError, errorMessage } from "@/lib/errors";
import { formatPhone, phoneCI } from "@/lib/phone";
import { clearSession, readSession } from "@/lib/session";
import type { Creds } from "@/lib/types";

/** Paramètres modifiables sans toucher au code : numéro de dépôt Wave
 *  (settings.depot_phone), affiché partout où l'app demande une recharge. */
export default function ParametresPage() {
  const router = useRouter();
  const base = usePrivateBase();
  const [creds, setCreds] = useState<Creds | null>(null);

  useEffect(() => {
    const s = readSession();
    if (!s || s.role !== "admin") router.replace("/login");
    else setCreds(s);
  }, [router]);

  if (!creds) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Logo href={base} />
        <Badge tone="ink">Super admin</Badge>
      </header>
      <button onClick={() => router.push(base)} className="mb-4 mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-azur">
        <Icon name="arrow" size={16} className="rotate-180" /> Retour au cockpit
      </button>
      <DepotPhoneForm creds={creds} />
    </main>
  );
}

function DepotPhoneForm({ creds }: { creds: Creds }) {
  const router = useRouter();
  const [actuel, setActuel] = useState<string | null>(null);
  const [tel, setTel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.admin.load(creds);
      setActuel(d.settings.depot_phone);
      setTel(d.settings.depot_phone);
    } catch (e) {
      if (e instanceof AppError && e.code === "REFUSE") {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(errorMessage(e));
    }
  }, [creds, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalise = phoneCI(tel);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    if (!normalise) return setError(new AppError("TEL_INVALIDE_CI").message);
    setBusy(true);
    try {
      await api.admin.setDepotPhone(creds, normalise);
      setOk(true);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Numéro de dépôt">
      <p className="mb-5 max-w-lg text-sm font-medium text-ink/60">
        Numéro qui reçoit les recharges Wave des clients et des chauffeurs. Il s&apos;affiche sur la page d&apos;accueil, l&apos;écran « Solde insuffisant » et l&apos;espace chauffeur.
      </p>
      {actuel === null && !error ? (
        <Spinner />
      ) : (
        <form onSubmit={submit} className="max-w-sm space-y-5">
          <p className="text-sm font-semibold">
            Actuel : <strong className="font-display text-lg">{actuel ? formatPhone(actuel) : "—"}</strong>
          </p>
          <Field label="Nouveau numéro" hint={normalise ? `Sera enregistré : ${formatPhone(normalise)}` : "10 chiffres, ex. 0789855418"}>
            <PhoneInput value={tel} onChange={setTel} autoComplete="off" />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          {ok && (
            <p className="flex items-center gap-1.5 font-semibold text-azur">
              <Icon name="check" size={16} /> Numéro enregistré.
            </p>
          )}
          <Btn type="submit" variant="ink" disabled={busy || !normalise || normalise === actuel}>
            {busy ? "Un instant…" : "Enregistrer"}
          </Btn>
        </form>
      )}
    </Panel>
  );
}
