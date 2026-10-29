"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Btn, ErrorBox, SuccessBox } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { positionActuelle } from "@/lib/gps";
import { getSupabase } from "@/lib/supabase";

/**
 * MODE POSE : visible uniquement si un ADMIN (2FA) est connecté sur ce
 * téléphone. Il colle l'autocollant, le scanne, et enregistre la position GPS
 * du portail en un geste. Pour tout autre visiteur, ce bloc n'existe pas (et
 * la base refuserait l'appel de toute façon).
 */
export function ModePose({ qr }: { qr: string }) {
  const [admin, setAdmin] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void (async () => {
      // Lecture locale d'abord : aucun appel réseau pour les clients normaux.
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      try {
        const moi = await rpc<{ est_admin: boolean; aal: string | null }>("admin_moi");
        setAdmin(moi.est_admin && moi.aal === "aal2");
      } catch {}
    })();
  }, []);

  if (!admin) return null;

  const poser = async () => {
    setMsg(null);
    setEnvoi(true);
    try {
      const p = await positionActuelle();
      const r = await rpc<{ code_affichage: string }>("admin_poser_maison", { p_qr: qr, p_lat: p.lat, p_long: p.long });
      setMsg({
        ok: true,
        t: `Position de ${r.code_affichage} enregistrée (±${p.precision} m).${p.precision > 30 ? " Précision moyenne : réessaie dehors, juste devant le portail." : ""}`,
      });
    } catch (e) {
      setMsg({ ok: false, t: messageErreur(e) });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mb-5 space-y-3 rounded-brut border-brut border-dashed border-ink bg-white p-4">
      <p className="flex items-center gap-2 font-bold">
        <Icon name="shield" size={18} className="text-azur" /> Mode pose (admin)
      </p>
      <p className="text-sm text-ink/65">Devant le portail, après avoir collé l&apos;autocollant : enregistre la position GPS de la maison.</p>
      <Btn variant="azur" className="w-full" onClick={() => void poser()} disabled={envoi}>
        <Icon name="pin" size={18} /> {envoi ? "Localisation…" : "Enregistrer la position ici"}
      </Btn>
      {msg && (msg.ok ? <SuccessBox>{msg.t}</SuccessBox> : <ErrorBox>{msg.t}</ErrorBox>)}
    </div>
  );
}
