"use client";

import { useState } from "react";
import { Btn, ErrorBox, Stars } from "./ui";

const LIBELLES = ["", "Très mauvais", "Mauvais", "Correct", "Bien", "Excellent"];

/** 5 étoiles + commentaire facultatif (500 caractères max, comme en base). */
export function AvisForm({ onEnvoyer, bouton = "Envoyer mon avis" }: { onEnvoyer: (note: number, commentaire: string) => Promise<void>; bouton?: string }) {
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async () => {
    if (note < 1) return setErr("Touche une étoile pour donner ta note.");
    setErr(null);
    setEnvoi(true);
    try {
      await onEnvoyer(note, commentaire.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Une erreur est survenue.");
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2">
        <Stars value={note} onChange={setNote} size={48} />
        <p className="h-6 font-bold text-azur">{LIBELLES[note]}</p>
      </div>
      <label className="block">
        <span className="label">Commentaire (facultatif)</span>
        <textarea
          className="field min-h-[110px] resize-y !text-base"
          maxLength={500}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          placeholder="Ce qui t'a plu, ce qu'il faut améliorer…"
        />
        <span className="mt-1 block text-right text-xs text-ink/45">{commentaire.length}/500</span>
      </label>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn size="lg" className="w-full" onClick={() => void envoyer()} disabled={envoi}>
        {envoi ? "Envoi…" : bouton}
      </Btn>
    </div>
  );
}
