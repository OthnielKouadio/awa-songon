"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, CodeInput, ErrorBox, Field, Logo, PhoneInput, Spinner } from "@/components/ui";
import { Chip } from "@/app/admin/shared";
import { ApiError, messageErreur, rpc } from "@/lib/api";
import { ecrireJetonLivreur } from "@/lib/livreurSession";
import { isValidPhone } from "@/lib/phone";
import { codeTropSimple } from "@/lib/pin";

type Cites = { cites: { id: string; nom: string }[]; sources: { id: string; nom: string; cite_id: string }[] };

/** Inscription d'un livreur recruté (lien envoyé par l'admin). Le compte reste
 *  invisible des clients tant que l'admin ne l'a pas validé. */
export function Recrutement() {
  const router = useRouter();
  const [data, setData] = useState<Cites | null>(null);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [cite, setCite] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [prix, setPrix] = useState("2500");
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    rpc<Cites>("public_cites").then(setData, (e) => setErr(messageErreur(e)));
  }, []);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (nom.trim().length < 2) return setErr("Indique ton nom.");
    if (!isValidPhone(tel)) return setErr(messageErreur(new ApiError("TELEPHONE_INVALIDE")));
    if (!cite) return setErr("Choisis ta cité.");
    if (!/^\d{4}$/.test(code)) return setErr("Le code fait 4 chiffres.");
    if (codeTropSimple(code)) return setErr(messageErreur(new ApiError("CODE_TROP_SIMPLE")));
    if (code !== code2) return setErr("Les deux codes ne sont pas identiques.");
    setEnvoi(true);
    try {
      const r = await rpc<{ ok: true; jeton: string }>("l_inscription", { p_nom: nom, p_telephone: tel, p_cite: cite, p_source: source, p_code: code, p_prix: Number(prix) });
      ecrireJetonLivreur(r.jeton);
      const res = await fetch("/api/espace-livreur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jeton: r.jeton }) });
      router.replace(res.ok ? ((await res.json()) as { home: string }).home : "/login");
    } catch (e) {
      setErr(messageErreur(e));
      setEnvoi(false);
    }
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-8">
        <Logo href="/" />
      </header>
      {!data && !err && <Spinner />}
      <form onSubmit={soumettre} className="space-y-5" noValidate>
        <div>
          <h1 className="title-lg">Devenir livreur</h1>
          <p className="mt-2 text-ink/70">Ton compte sera activé après vérification par l&apos;administrateur (identité, tricycle).</p>
        </div>
        <Field label="Nom complet">
          <input className="field" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Téléphone">
          <PhoneInput value={tel} onChange={setTel} />
        </Field>
        {data && (
          <div>
            <span className="label">Ta cité</span>
            <div className="flex flex-wrap gap-1.5">
              {data.cites.map((c) => (
                <Chip key={c.id} actif={cite === c.id} onClick={() => { setCite(c.id); setSource(null); }}>
                  {c.nom}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {data && cite && data.sources.some((s) => s.cite_id === cite) && (
          <div>
            <span className="label">Ton forage habituel (facultatif)</span>
            <div className="flex flex-wrap gap-1.5">
              <Chip actif={source === null} onClick={() => setSource(null)}>
                Un peu partout
              </Chip>
              {data.sources
                .filter((s) => s.cite_id === cite)
                .map((s) => (
                  <Chip key={s.id} actif={source === s.id} onClick={() => setSource(s.id)}>
                    {s.nom}
                  </Chip>
                ))}
            </div>
          </div>
        )}
        <Field label="Ton prix pour 1000 L (FCFA)" hint="Modifiable ensuite à tout moment.">
          <input className="field" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value.replace(/\D/g, "").slice(0, 5))} />
        </Field>
        <Field label="Choisis ton code (4 chiffres)">
          <CodeInput value={code} onChange={setCode} label="Code" />
        </Field>
        <Field label="Retape le code">
          <CodeInput value={code2} onChange={setCode2} label="Confirmation du code" />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn type="submit" size="lg" className="w-full" disabled={envoi || !data}>
          {envoi ? "Inscription…" : "M'inscrire"}
        </Btn>
      </form>
    </main>
  );
}
