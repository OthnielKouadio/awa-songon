"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ChauffeurSignupForm from "@/components/auth/ChauffeurSignupForm";
import ClientSignupForm from "@/components/auth/ClientSignupForm";
import { Icon, type IconName } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, Logo, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { normalizePhone } from "@/lib/format";
import { HOME, saveSession } from "@/lib/session";
import type { Role } from "@/lib/types";

type Choix = "client" | "chauffeur";

const CARDS: { role: Choix; icon: IconName; title: string; text: string }[] = [
  { role: "client", icon: "home", title: "Je suis client", text: "Commande de l'eau pour ton lot." },
  { role: "chauffeur", icon: "truck", title: "Je suis chauffeur", text: "Gère ta file et tes livraisons." },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4"><Spinner /></main>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const roleParam = params.get("role");
  const [choix, setChoix] = useState<Choix | null>(roleParam === "client" || roleParam === "chauffeur" ? roleParam : null);
  const [checking, setChecking] = useState(true);

  // Déjà connecté (n'importe quel rôle, admin compris) → direct sur son tableau de bord.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem("awa:session:v4");
    } catch {}
    if (raw) {
      try {
        const c = JSON.parse(raw) as { role?: Role };
        if (c.role) {
          router.replace(HOME[c.role]);
          return;
        }
      } catch {}
    }
    setChecking(false);
  }, [router]);

  function onSession(role: Role) {
    router.push(HOME[role]);
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
        <Logo href="/login" />
      </header>

      <AnimatePresence mode="wait">
        {!choix ? (
          <motion.div key="choix" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center">
              <Badge tone="sky">Songon</Badge>
              <h1 className="title-xl mt-4 !text-4xl sm:!text-5xl">Tu es qui ?</h1>
            </div>
            <div className="mt-8 space-y-4">
              {CARDS.map((c, i) => (
                <motion.button
                  key={c.role}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 220, damping: 24 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setChoix(c.role)}
                  className="brut flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-sky"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-azur text-white">
                    <Icon name={c.icon} size={28} />
                  </span>
                  <span>
                    <span className="block font-display text-xl font-bold uppercase tracking-tight">{c.title}</span>
                    <span className="mt-0.5 block text-sm font-medium text-ink/60">{c.text}</span>
                  </span>
                  <Icon name="arrow" size={22} className="ml-auto shrink-0 text-azur" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <button onClick={() => setChoix(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-azur">
              <Icon name="arrow" size={16} className="rotate-180" /> Retour
            </button>
            {choix === "client" ? <ClientAuth onSession={onSession} /> : <ChauffeurAuth onSession={onSession} />}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ─── Onglets Connexion / Inscription ───────────────────────────────────────

function AuthTabs({ mode, onChange }: { mode: "login" | "signup"; onChange: (m: "login" | "signup") => void }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border-brut border-ink bg-white p-1" role="tablist">
      {(
        [
          ["login", "Connexion"],
          ["signup", "Inscription"],
        ] as const
      ).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={mode === id} onClick={() => onChange(id)} className="relative rounded-xl py-2.5 font-bold transition-colors">
          {mode === id && <motion.span layoutId="login-tab" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
          <span className={`relative ${mode === id ? "text-white" : "text-ink/60"}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Champ secret de connexion : un client/chauffeur tape 4 chiffres, l'admin son
 *  mot de passe — le même formulaire sert aux 3, donc pas de contrainte de format. */
function SecretLoginField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Ton code">
      <input
        className="field"
        type="password"
        autoComplete="current-password"
        placeholder="••••"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </Field>
  );
}

// ─── Client ─────────────────────────────────────────────────────────────────

function ClientAuth({ onSession }: { onSession: (role: Role) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [tel, setTel] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api.login("client", normalizePhone(tel), secret);
      saveSession(r.session.creds);
      onSession(r.role); // un identifiant admin saisi ici redirige quand même vers /admin
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <Badge tone="sky">Espace client</Badge>
      <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">{signup ? "Crée ton compte" : "Content de te revoir"}</h1>
      <AuthTabs mode={mode} onChange={switchMode} />

      {signup ? (
        <ClientSignupForm onSession={onSession} />
      ) : (
        <form onSubmit={submit} className="brut space-y-5 p-5">
          <Field label="Ton numéro de téléphone">
            <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={tel} onChange={(e) => setTel(e.target.value)} required />
          </Field>
          <SecretLoginField value={secret} onChange={setSecret} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !tel.trim() || !secret}>
            {busy ? "Un instant…" : "Entrer"} {!busy && <Icon name="arrow" size={20} />}
          </Btn>
        </form>
      )}
    </div>
  );
}

// ─── Chauffeur ──────────────────────────────────────────────────────────────

function ChauffeurAuth({ onSession }: { onSession: (role: Role) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [tel, setTel] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api.login("chauffeur", normalizePhone(tel), secret);
      saveSession(r.session.creds);
      onSession(r.role); // un identifiant admin saisi ici redirige quand même vers /admin
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <Badge tone="sky">Espace chauffeur</Badge>
      <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">{signup ? "Crée ton compte" : "Content de te revoir"}</h1>
      <AuthTabs mode={mode} onChange={switchMode} />

      {signup ? (
        <ChauffeurSignupForm onSession={onSession} />
      ) : (
        <form onSubmit={submit} className="brut space-y-5 p-5">
          <Field label="Ton numéro de téléphone">
            <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={tel} onChange={(e) => setTel(e.target.value)} required />
          </Field>
          <SecretLoginField value={secret} onChange={setSecret} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !tel.trim() || !secret}>
            {busy ? "Un instant…" : "Entrer"} {!busy && <Icon name="arrow" size={20} />}
          </Btn>
        </form>
      )}
    </div>
  );
}
