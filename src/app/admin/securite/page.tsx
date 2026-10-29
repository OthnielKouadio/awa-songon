"use client";

import { useState } from "react";
import { Btn, ErrorBox, Field, SuccessBox } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

/** Sécurité (V2) : changer le mot de passe admin. La 2FA reste exigée. */
export default function SecuritePage() {
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (mdp.length < 12) return setMsg({ ok: false, t: "12 caractères minimum (une phrase facile à retenir, c'est très bien)." });
    if (mdp !== mdp2) return setMsg({ ok: false, t: "Les deux mots de passe ne sont pas identiques." });
    setEnvoi(true);
    const { error } = await getSupabase()!.auth.updateUser({ password: mdp });
    setEnvoi(false);
    if (error) setMsg({ ok: false, t: error.code === "same_password" ? "C'est déjà ton mot de passe actuel." : `Impossible de changer le mot de passe (${error.code ?? error.message}).` });
    else {
      setMdp("");
      setMdp2("");
      setMsg({ ok: true, t: "Mot de passe changé." });
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <h1 className="title-lg">Sécurité</h1>
      <form onSubmit={valider} className="space-y-4 rounded-brut border-brut border-ink bg-white p-5">
        <h2 className="title-md">Changer le mot de passe</h2>
        <Field label="Nouveau mot de passe">
          <input className="field" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </Field>
        <Field label="Retape-le">
          <input className="field" type="password" autoComplete="new-password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} />
        </Field>
        {msg && (msg.ok ? <SuccessBox>{msg.t}</SuccessBox> : <ErrorBox>{msg.t}</ErrorBox>)}
        <Btn type="submit" disabled={envoi}>
          {envoi ? "Enregistrement…" : "Changer le mot de passe"}
        </Btn>
      </form>
      <div className="space-y-2 rounded-2xl border-brut border-azur bg-sky p-4 text-sm font-semibold">
        <p>La double authentification (Google Authenticator) reste obligatoire à chaque connexion.</p>
        <p>Téléphone perdu ? Dans Supabase → Authentication → Users → ton compte → supprime le facteur « totp » : l&apos;appli te fera en réactiver un à la prochaine connexion.</p>
      </div>
    </div>
  );
}
