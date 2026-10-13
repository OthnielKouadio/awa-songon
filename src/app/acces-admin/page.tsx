"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { Btn, ErrorBox, Field, Logo } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { errorMessage } from "@/lib/errors";
import { openSession } from "@/lib/session";

/** Connexion admin, servie UNIQUEMENT par /<ADMIN_LOGIN_PATH> (/acces-admin → 404).
 *  Le middleware renvoie aussi 404 si le navigateur a une session non-admin. */
export default function AccesAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const s = await api.loginAdmin(email, password);
      router.push(await openSession(s.creds));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8 flex justify-center">
        <Logo href="/" />
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink text-white">
            <Icon name="lock" size={28} />
          </span>
          <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">Accès administrateur</h1>
          <p className="mt-2 font-medium text-ink/60">Entrez vos identifiants</p>
        </div>

        <form onSubmit={submit} className="brut mt-8 space-y-5 p-5">
          <Field label="Email">
            <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Mot de passe">
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !email.trim() || !password}>
            {busy ? "Un instant…" : "Se connecter"}
          </Btn>
        </form>
      </motion.div>
    </main>
  );
}
