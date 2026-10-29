"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Btn, ErrorBox, Field, Logo, Spinner } from "@/components/ui";
import { rpc } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

/**
 * Porte d'entrée de l'admin :
 *   1. email + mot de passe (Supabase Auth) ;
 *   2. compte présent dans public.admins ;
 *   3. 2FA TOTP (Google Authenticator…) : activation imposée au 1er passage,
 *      puis code à 6 chiffres à chaque connexion.
 * La vraie protection est côté base : chaque fonction admin exige aal2
 * (is_admin()). Cette porte ne fait que guider l'admin jusque-là.
 */
type Etape =
  | { t: "chargement" }
  | { t: "config" }
  | { t: "connexion" }
  | { t: "pas_admin" }
  | { t: "activer_2fa"; factorId: string; qr: string; secret: string }
  | { t: "code_2fa"; factorId: string }
  | { t: "ok"; email: string };

export function AdminGate({ children }: { children: (email: string, deconnexion: () => void) => ReactNode }) {
  const sb = getSupabase();
  const [etape, setEtape] = useState<Etape>(sb ? { t: "chargement" } : { t: "config" });

  const evaluer = useCallback(
    async (session: Session | null) => {
      if (!sb) return;
      if (!session) return setEtape({ t: "connexion" });
      try {
        const moi = await rpc<{ est_admin: boolean }>("admin_moi");
        if (!moi.est_admin) return setEtape({ t: "pas_admin" });
        const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === "aal2") return setEtape({ t: "ok", email: session.user.email ?? "" });
        const { data: facteurs } = await sb.auth.mfa.listFactors();
        const verifie = facteurs?.totp.find((f) => f.status === "verified");
        if (verifie) return setEtape({ t: "code_2fa", factorId: verifie.id });
        // Pas encore de 2FA : on nettoie les tentatives d'activation abandonnées, puis on en crée une.
        for (const f of facteurs?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Distribution Eau ${new Date().toISOString().slice(0, 10)}` });
        if (error || !data) throw error ?? new Error("2FA indisponible");
        setEtape({ t: "activer_2fa", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      } catch (e) {
        console.error("[admin]", e);
        setEtape({ t: "connexion" });
      }
    },
    [sb]
  );

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => evaluer(data.session));
    const { data } = sb.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_OUT") setEtape({ t: "connexion" });
      else if (evt === "SIGNED_IN" || evt === "MFA_CHALLENGE_VERIFIED") void evaluer(session);
    });
    return () => data.subscription.unsubscribe();
  }, [sb, evaluer]);

  const deconnexion = useCallback(() => void sb?.auth.signOut(), [sb]);

  if (etape.t === "ok") return <>{children(etape.email, deconnexion)}</>;

  return (
    <main className="mx-auto min-h-dvh max-w-sm px-4 pt-10">
      <div className="mb-8 flex justify-center">
        <Logo href="/" />
      </div>
      {etape.t === "chargement" && <Spinner />}
      {etape.t === "config" && <ErrorBox>Supabase n&apos;est pas configuré (variables NEXT_PUBLIC_SUPABASE_*).</ErrorBox>}
      {etape.t === "connexion" && <Connexion />}
      {etape.t === "pas_admin" && (
        <div className="space-y-4">
          <ErrorBox>Ce compte n&apos;est pas administrateur.</ErrorBox>
          <Btn variant="white" className="w-full" onClick={deconnexion}>
            Se déconnecter
          </Btn>
        </div>
      )}
      {(etape.t === "activer_2fa" || etape.t === "code_2fa") && <DeuxFacteurs etape={etape} onAnnuler={deconnexion} />}
    </main>
  );
}

function Connexion() {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setEnvoi(true);
    const { error } = await getSupabase()!.auth.signInWithPassword({ email: email.trim(), password: mdp });
    setEnvoi(false);
    if (!error) return;
    // « email non confirmé » n'est renvoyé par Supabase qu'avec le BON mot de
    // passe : l'afficher ne révèle rien à un inconnu.
    if (error.code === "email_not_confirmed")
      setErr("Mot de passe correct, mais ton email n'est pas confirmé dans Supabase. Supprime l'utilisateur dans Authentication → Users et recrée-le en cochant « Auto Confirm User ».");
    else if (error.status === 429 || error.code === "over_request_rate_limit") setErr("Trop d'essais. Patiente quelques minutes.");
    else if (error.code === "email_provider_disabled") setErr("La connexion par email est désactivée dans Supabase (Authentication → Sign In / Providers → Email).");
    else if (error.code === "invalid_credentials") setErr("Email ou mot de passe incorrect.");
    else setErr(`Connexion impossible (${error.code ?? error.message}).`);
  };

  return (
    <form onSubmit={soumettre} className="space-y-4">
      <h1 className="title-md">Administration</h1>
      <Field label="Email">
        <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Mot de passe">
        <input className="field" type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
      </Field>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
        {envoi ? "Connexion…" : "Se connecter"}
      </Btn>
    </form>
  );
}

function DeuxFacteurs({ etape, onAnnuler }: { etape: Extract<Etape, { t: "activer_2fa" | "code_2fa" }>; onAnnuler: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const verifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setEnvoi(true);
    const { error } = await getSupabase()!.auth.mfa.challengeAndVerify({ factorId: etape.factorId, code });
    setEnvoi(false);
    if (error) {
      setErr("Code incorrect ou expiré. Prends le code affiché en ce moment dans l'application.");
      setCode("");
    }
  };

  return (
    <form onSubmit={verifier} className="space-y-4">
      <h1 className="title-md">Double authentification</h1>
      {etape.t === "activer_2fa" ? (
        <>
          <p className="text-ink/70">
            Obligatoire pour protéger l&apos;admin. Scanne ce QR avec <strong>Google Authenticator</strong> (ou Authy), puis tape le code à 6 chiffres.
          </p>
          <div className="mx-auto w-52 rounded-2xl border-brut border-ink bg-white p-3">
            {/* QR SVG fourni par Supabase (data:) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={etape.qr} alt="QR de la double authentification" className="h-full w-full" />
          </div>
          <p className="break-all text-center text-xs text-ink/50">Clé manuelle : {etape.secret}</p>
        </>
      ) : (
        <p className="text-ink/70">Tape le code à 6 chiffres affiché dans ton application d&apos;authentification.</p>
      )}
      <input
        className="field text-center !text-3xl font-bold tracking-[0.4em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        autoFocus
        aria-label="Code à 6 chiffres"
      />
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi || code.length !== 6}>
        {envoi ? "Vérification…" : "Valider"}
      </Btn>
      <button type="button" onClick={onAnnuler} className="w-full text-sm font-semibold text-ink/50 hover:text-ink">
        Se déconnecter
      </button>
    </form>
  );
}
