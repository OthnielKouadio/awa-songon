"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, CodeInput, ErrorBox, Field, Logo, PhoneInput, Spinner } from "@/components/ui";
import { ApiError, messageErreur, rpc } from "@/lib/api";
import { enregistrerAppareil, tousLesAppareils } from "@/lib/appareils";
import { ecrireJetonLivreur, lireJetonLivreur } from "@/lib/livreurSession";
import { isValidPhone } from "@/lib/phone";

type Reponse =
  | { ok: true; role: "foyer"; qr: string; code_affichage: string; jeton: string }
  | { ok: true; role: "livreur"; jeton: string; code_provisoire: boolean };

async function adresseLivreur(jeton: string): Promise<string | null> {
  const r = await fetch("/api/espace-livreur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jeton }) }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json()) as { home: string }).home;
}

/**
 * Connexion unique (V2) : numéro + code à 4 chiffres, sans choisir son rôle.
 *   famille  → numéro inscrit dans le foyer + CODE MAISON → sa maison
 *   livreur  → numéro + son code → son espace (lien secret)
 * L'admin ne se connecte jamais ici (page secrète + 2FA).
 */
export default function LoginPage() {
  const router = useRouter();
  const [verif, setVerif] = useState(true);
  const [tel, setTel] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Déjà connecté sur ce téléphone → directement au bon endroit.
  useEffect(() => {
    void (async () => {
      const j = lireJetonLivreur();
      if (j) {
        const home = await adresseLivreur(j);
        if (home) return router.replace(home);
      }
      const maisons = tousLesAppareils();
      if (maisons.length === 1) return router.replace(`/m/${maisons[0].qr}`);
      setVerif(false);
    })();
  }, [router]);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!isValidPhone(tel)) return setErr(messageErreur(new ApiError("TELEPHONE_INVALIDE")));
    if (!/^\d{4}$/.test(code)) return setErr("Le code fait 4 chiffres.");
    setEnvoi(true);
    try {
      const r = await rpc<Reponse>("auth_connexion", { p_telephone: tel, p_code: code });
      if (r.role === "foyer") {
        enregistrerAppareil(r.qr, { jeton: r.jeton, code_affichage: r.code_affichage });
        router.replace(`/m/${r.qr}`);
        return;
      }
      ecrireJetonLivreur(r.jeton);
      const home = await adresseLivreur(r.jeton);
      if (!home) throw new ApiError("SESSION");
      router.replace(home);
    } catch (e) {
      setErr(messageErreur(e));
      setCode("");
      setEnvoi(false);
    }
  };

  if (verif) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-8">
        <Logo href="/" />
      </header>
      <form onSubmit={soumettre} className="space-y-5" noValidate>
        <div>
          <h1 className="title-lg">Se connecter</h1>
          <p className="mt-2 text-ink/70">Ton numéro et ton code à 4 chiffres (le code maison pour une famille).</p>
        </div>
        <Field label="Numéro de téléphone">
          <PhoneInput value={tel} onChange={setTel} />
        </Field>
        <Field label="Code à 4 chiffres">
          <CodeInput value={code} onChange={setCode} label="Code" />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
          {envoi ? "Connexion…" : "Se connecter"}
        </Btn>
        <p className="text-center text-sm text-ink/60">
          Code oublié ? Appelle le service : il te donne un code provisoire après avoir vérifié ton identité.
        </p>
        <p className="text-center text-sm font-semibold">
          Pas encore inscrit ?{" "}
          <Link href="/inscription" className="text-azur underline">
            Inscrire ma maison
          </Link>
        </p>
      </form>
    </main>
  );
}
