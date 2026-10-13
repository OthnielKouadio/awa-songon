"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { erreurTelephone } from "@/components/auth/inscription";
import { Icon } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, Logo, PhoneInput, PinInput, Spinner } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { errorMessage } from "@/lib/errors";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { clearSession, openSession, readSession } from "@/lib/session";
import { useDepotPhone } from "@/lib/useDepotPhone";

/** Connexion client ET chauffeur, sans choix de rôle : le serveur reconnaît le
 *  numéro (auth_login 'auto') et renvoie vers le bon espace. L'admin ne se
 *  connecte jamais ici (page secrète dédiée). */
export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tel, setTel] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [oubli, setOubli] = useState(false);
  const depot = useDepotPhone();

  // Déjà connecté → direct sur son tableau de bord (jeton revérifié par le serveur).
  useEffect(() => {
    const c = readSession();
    if (!c) return setChecking(false);
    openSession(c)
      .then((home) => router.replace(home))
      .catch(() => {
        clearSession();
        setChecking(false);
      });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const errTel = erreurTelephone(tel);
    if (errTel) return setError(errTel);
    setBusy(true);
    try {
      const r = await api.login(normalizePhone(tel), pin);
      router.push(await openSession(r.session.creds));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8 flex justify-center">
        <Logo href="/" />
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center">
          <Badge tone="sky">Songon</Badge>
          <h1 className="title-xl mt-4 !text-4xl sm:!text-5xl">Content de te revoir</h1>
        </div>

        <form onSubmit={submit} className="brut mt-8 space-y-5 p-5">
          <Field label="Ton numéro de téléphone">
            <PhoneInput value={tel} onChange={setTel} />
          </Field>
          <Field label="Ton code PIN">
            <PinInput value={pin} onChange={setPin} autoComplete="current-password" />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !tel.trim() || pin.length !== 4}>
            {busy ? "Un instant…" : "Entrer"} {!busy && <Icon name="arrow" size={20} />}
          </Btn>
        </form>

        <div className="mt-4 text-center">
          <button type="button" onClick={() => setOubli((v) => !v)} className="text-sm font-bold text-azur underline-offset-4 hover:underline">
            Code oublié ?
          </button>
          {oubli && (
            <p className="mt-2 rounded-2xl border-brut border-ink bg-sky p-4 text-left text-sm font-medium text-ink/80">
              Appelle l&apos;administrateur au <strong>{depot ? formatPhone(depot) : "…"}</strong>. Après vérification, il te donne un code provisoire :
              connecte-toi avec, puis choisis ton nouveau code.
            </p>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/inscription" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-azur">
            Pas encore de compte ? Commander mon eau <Icon name="arrow" size={16} />
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
