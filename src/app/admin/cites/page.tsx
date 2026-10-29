"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, Modal, ModalTitle, Spinner, SuccessBox, useConfirm } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { useRpc } from "@/lib/useRpc";
import { Forages } from "./Forages";
import type { Cite } from "../types";

export default function CitesPage() {
  const { data: cites, err, chargement, reload } = useRpc<Cite[]>("admin_cites", undefined, "cites");
  const [edition, setEdition] = useState<Cite | "nouvelle" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const supprimer = async (c: Cite) => {
    setActionErr(null);
    if (!(await confirm(<>Supprimer la cité <strong>{c.nom}</strong> ?</>, { danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await rpc("admin_supprimer_cite", { p_id: c.id });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="title-lg">Cités &amp; forages</h1>
        <Btn onClick={() => setEdition("nouvelle")}>
          <Icon name="plus" size={18} /> Nouvelle cité
        </Btn>
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}
      {actionErr && <ErrorBox>{actionErr}</ErrorBox>}
      {chargement && !cites && <Spinner />}

      <ul className="grid gap-3 sm:grid-cols-2">
        {cites?.map((c) => (
          <li key={c.id} className="rounded-brut border-brut border-ink bg-white p-5 shadow-hard-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-2xl font-bold">{c.nom}</p>
                <Badge tone="ink">{c.code_court}</Badge>
              </div>
              <div className="flex gap-1.5">
                <Btn variant="white" onClick={() => setEdition(c)} aria-label={`Modifier ${c.nom}`}>
                  Modifier
                </Btn>
                {c.maisons === 0 && c.livreurs === 0 && (
                  <Btn variant="danger" onClick={() => void supprimer(c)} aria-label={`Supprimer ${c.nom}`}>
                    <Icon name="trash" size={18} />
                  </Btn>
                )}
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
              <Stat k="Maisons" v={c.maisons} />
              <Stat k="Occupées" v={c.occupees} />
              <Stat k="Bloquées" v={c.bloquees} />
              <Stat k="Livreurs" v={c.livreurs} />
            </dl>
            {c.dernier_numero !== null && <p className="mt-3 text-sm text-ink/55">Dernier numéro : {c.code_court} {String(c.dernier_numero).padStart(3, "0")}</p>}
          </li>
        ))}
      </ul>
      {cites?.length === 0 && <p className="py-6 text-center font-semibold text-ink/50">Aucune cité. Crée la première (ex. Promogim · PROMO).</p>}

      <Forages cites={cites ?? []} />

      <Parametres />

      <ModalCite cite={edition} onClose={() => setEdition(null)} onFait={() => void reload()} />
      {dialog}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-xl bg-mist py-2">
      <dd className="font-display text-xl font-bold">{v}</dd>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink/55">{k}</dt>
    </div>
  );
}

function ModalCite({ cite, onClose, onFait }: { cite: Cite | "nouvelle" | null; onClose: () => void; onFait: () => void }) {
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const existante = cite && cite !== "nouvelle" ? cite : null;

  useEffect(() => {
    setNom(existante?.nom ?? "");
    setCode(existante?.code_court ?? "");
    setErr(null);
  }, [cite, existante]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (existante) await rpc("admin_modifier_cite", { p_id: existante.id, p_nom: nom, p_code_court: code });
      else await rpc("admin_creer_cite", { p_nom: nom, p_code_court: code });
      onFait();
      onClose();
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  const verrouille = !!existante && existante.maisons > 0;

  return (
    <Modal open={!!cite} onClose={onClose}>
      <ModalTitle onClose={onClose}>{existante ? "Modifier la cité" : "Nouvelle cité"}</ModalTitle>
      <form onSubmit={enregistrer} className="space-y-4">
        <Field label="Nom">
          <input className="field" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Promogim" maxLength={60} required />
        </Field>
        <Field
          label="Code court (imprimé sur les autocollants)"
          hint={verrouille ? "Verrouillé : des autocollants portent déjà ce code." : "2 à 5 lettres. Ex. PROMO → PROMO 001, PROMO 002…"}
        >
          <input
            className="field font-display !text-2xl font-bold uppercase tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))}
            placeholder="PROMO"
            disabled={verrouille}
            required
          />
        </Field>
        {code.length >= 2 && <p className="rounded-2xl bg-sky p-3 font-semibold">Aperçu : {code} 001, {code} 002…</p>}
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn type="submit" size="lg" className="w-full">
          Enregistrer
        </Btn>
      </form>
    </Modal>
  );
}

type Params = {
  site_url: string;
  cout_commande_points: number;
  cout_livreur_points: number;
  essai_fin: string | null;
  telephone_service: string | null;
  wave_marchand: string | null;
  cgv_version: string;
};

const aujourdhui = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Abidjan" }); // AAAA-MM-JJ

function Parametres() {
  const { data } = useRpc<Params>("admin_parametres", undefined, "params");
  const [site, setSite] = useState("");
  const [cout, setCout] = useState("");
  const [coutLivreur, setCoutLivreur] = useState("");
  const [essai, setEssai] = useState("");
  const [tel, setTel] = useState("");
  const [wave, setWave] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setWave(data.wave_marchand ?? "");
    setSite(data.site_url);
    setCout(String(data.cout_commande_points));
    setCoutLivreur(String(data.cout_livreur_points));
    setEssai(data.essai_fin ?? "");
    setTel(data.telephone_service ?? "");
  }, [data]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await rpc("admin_enregistrer_parametres", {
        p_site_url: site.trim(),
        p_cout: Number(cout),
        p_cout_livreur: Number(coutLivreur),
        p_telephone_service: tel || null,
        p_essai_fin: essai || null,
        p_wave_marchand: wave || null,
      });
      setMsg({ ok: true, t: "Réglages enregistrés." });
    } catch (e) {
      setMsg({ ok: false, t: messageErreur(e) });
    }
  };

  const essaiEnCours = !!essai && essai >= aujourdhui();

  return (
    <form onSubmit={enregistrer} className="space-y-4 rounded-brut border-brut border-ink bg-white p-5">
      <h2 className="title-md">Réglages</h2>
      {/* L'adresse imprimée dans les QR n'est pas modifiable ici : un changement
          rendrait les autocollants déjà collés incohérents avec les nouveaux. */}
      <p className="rounded-2xl bg-mist p-3 text-sm">
        Adresse imprimée dans les QR : <strong>{site}</strong>
      </p>
      <div className="space-y-2 rounded-2xl border-brut border-azur bg-sky p-4">
        <Field
          label="Essai gratuit jusqu'au (inclus)"
          hint="Pour tout le monde, foyers et livreurs : aucun point débité jusqu'à cette date. Vide = pas d'essai."
        >
          <input className="field" type="date" value={essai} min={aujourdhui()} onChange={(e) => setEssai(e.target.value)} />
        </Field>
        <p className="text-sm font-bold">{essaiEnCours ? "✓ Essai gratuit en cours" : "Pas d'essai en cours : les points sont débités."}</p>
        {essai && (
          <button type="button" onClick={() => setEssai("")} className="text-sm font-bold text-danger hover:underline">
            Terminer l&apos;essai (vider la date)
          </button>
        )}
      </div>
      <Field label="Coût d'une commande pour le foyer (points)" hint="Débité à chaque commande (après l'essai), recrédité si elle est annulée.">
        <input className="field" inputMode="numeric" value={cout} onChange={(e) => setCout(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </Field>
      <Field label="Coût d'une commande pour le livreur (points)" hint="Débité au livreur pour chaque commande reçue ou saisie (après l'essai).">
        <input className="field" inputMode="numeric" value={coutLivreur} onChange={(e) => setCoutLivreur(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </Field>
      <Field label="Téléphone du service (recharges, aide)">
        <input className="field" inputMode="numeric" value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0700000000" />
      </Field>
      <Field
        label="Nom du marchand Wave"
        hint="Affiché au client, qui le vérifie sur l'écran Wave avant de payer. Le lien de paiement lui-même est figé dans le code (sécurité)."
      >
        <input className="field" value={wave} onChange={(e) => setWave(e.target.value)} maxLength={60} placeholder="Jeune roi hub" />
      </Field>
      {msg && (msg.ok ? <SuccessBox>{msg.t}</SuccessBox> : <ErrorBox>{msg.t}</ErrorBox>)}
      <Btn type="submit">Enregistrer les réglages</Btn>
    </form>
  );
}
