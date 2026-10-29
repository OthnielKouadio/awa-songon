"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, LinkBtn, Modal, ModalTitle, PhoneInput, Spinner, Stars, SuccessBox, useConfirm } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { dateHeure, fcfa, points } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { useRpc } from "@/lib/useRpc";
import { useBases } from "../Bases";
import { ChoixCite, Chip } from "../shared";
import type { AvisLivreur, Cite, Livreur } from "../types";

const STATUT: Record<Livreur["statut"], { label: string; tone: "green" | "orange" | "danger" | "gray" }> = {
  ACTIF: { label: "En service", tone: "green" },
  PAUSE: { label: "En pause", tone: "orange" },
  HORS_LIGNE: { label: "Hors ligne", tone: "gray" },
  BLOQUE: { label: "Bloqué", tone: "danger" },
};

export default function LivreursPage() {
  const { data: livreurs, err, chargement, reload } = useRpc<Livreur[]>("admin_livreurs", undefined, "livreurs");
  const { data: cites } = useRpc<Cite[]>("admin_cites", undefined, "cites");
  const [filtre, setFiltre] = useState<string | null>(null);
  const { data: avis } = useRpc<AvisLivreur[]>("admin_avis_livreurs", { p_livreur: filtre }, `avis-${filtre}`);
  const [edition, setEdition] = useState<Livreur | "nouveau" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [acces, setAcces] = useState<{ livreur: Livreur; code: string } | null>(null);
  const [recharge, setRecharge] = useState<Livreur | null>(null);
  const { confirm, dialog } = useConfirm();

  const bases = useBases();
  const valider = async (l: Livreur) => {
    setActionErr(null);
    if (!(await confirm(<>As-tu vérifié l&apos;identité, la pièce et le tricycle de <strong>{l.nom}</strong> ? Il deviendra visible des clients.</>, { confirmLabel: "Valider" }))) return;
    try {
      await rpc("admin_valider_livreur", { p_id: l.id });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };
  const paiement = async (l: Livreur) => {
    setActionErr(null);
    try {
      await rpc("admin_paiement", { p_type: "LIVREUR", p_id: l.id, p_statut: l.statut_paiement === "PAYE" ? "IMPAYE" : "PAYE" });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };

  const creerCode = async (l: Livreur) => {
    setActionErr(null);
    if (
      l.acces &&
      !(await confirm(<>Créer un nouveau code pour <strong>{l.nom}</strong> ? L&apos;ancien ne marchera plus et ses téléphones seront déconnectés.</>, { confirmLabel: "Nouveau code" }))
    )
      return;
    try {
      const code = await rpc<string>("admin_code_livreur", { p_id: l.id });
      setAcces({ livreur: l, code });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };

  const alertes = livreurs?.filter((l) => l.alerte_note) ?? [];

  const changerStatut = async (l: Livreur, statut: Livreur["statut"]) => {
    setActionErr(null);
    try {
      await rpc("admin_statut_livreur", { p_id: l.id, p_statut: statut });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title-lg">Livreurs</h1>
          <LienRecrutement lien={bases.recrutement} />
        </div>
        <Btn onClick={() => setEdition("nouveau")} disabled={!cites?.length}>
          <Icon name="plus" size={18} /> Nouveau livreur
        </Btn>
      </div>

      {alertes.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-brut border-brut border-danger bg-white p-4 text-danger">
          <Icon name="alert" size={26} />
          <div>
            <p className="font-bold">Note moyenne sous 3/5</p>
            <p className="text-sm font-semibold">{alertes.map((l) => `${l.nom} (${Number(l.note_moyenne).toFixed(1)}/5, ${l.total_avis} avis)`).join(" · ")}</p>
          </div>
        </div>
      )}

      {err && <ErrorBox>{err}</ErrorBox>}
      {actionErr && <ErrorBox>{actionErr}</ErrorBox>}
      {chargement && !livreurs && <Spinner />}

      <ul className="grid gap-3 md:grid-cols-2">
        {livreurs?.map((l) => (
          <li key={l.id} className={`rounded-brut border-brut bg-white p-4 shadow-hard-sm ${l.alerte_note ? "border-danger" : "border-ink"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-2xl font-bold">{l.nom}</p>
                <p className="text-sm text-ink/60">
                  {l.cite} · <a className="font-bold text-azur" href={`tel:${l.telephone}`}>{formatPhone(l.telephone)}</a> · {fcfa(l.prix_fcfa)}
                </p>
              </div>
              <Badge tone={STATUT[l.statut].tone}>{STATUT[l.statut].label}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {l.note_moyenne !== null ? (
                <>
                  <Stars value={Math.round(Number(l.note_moyenne))} size={22} />
                  <span className={`font-bold ${l.alerte_note ? "text-danger" : ""}`}>{Number(l.note_moyenne).toFixed(2)}/5</span>
                  <span className="text-sm text-ink/55">({l.total_avis} avis)</span>
                </>
              ) : (
                <span className="text-sm text-ink/50">Pas encore d&apos;avis</span>
              )}
              <span className="ml-auto text-sm font-semibold text-ink/60">{l.file} en file</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {!l.valide && (
                <Btn variant="azur" onClick={() => void valider(l)}>
                  Valider ce livreur
                </Btn>
              )}
              <Chip actif={l.statut_paiement === "PAYE"} onClick={() => void paiement(l)}>
                {l.statut_paiement === "PAYE" ? "Payé" : "Impayé"}
              </Chip>
              {!l.acces ? (
                <Badge tone="danger">Pas encore d&apos;accès</Badge>
              ) : l.code_provisoire ? (
                <Badge tone="orange">Code provisoire pas encore changé</Badge>
              ) : null}
              <Badge tone={l.disponible ? "green" : "gray"}>{l.disponible ? "Visible des clients" : "Invisible des clients"}</Badge>
              <span className="text-sm font-semibold text-ink/60">{points(l.solde_points)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink/10 pt-3">
              {(["ACTIF", "PAUSE", "HORS_LIGNE", "BLOQUE"] as const).map((s) => (
                <Chip key={s} actif={l.statut === s} onClick={() => void changerStatut(l, s)}>
                  {STATUT[s].label}
                </Chip>
              ))}
              <Chip actif={false} onClick={() => setEdition(l)}>
                Modifier
              </Chip>
              <Chip actif={false} onClick={() => void creerCode(l)}>
                {l.acces ? "Nouveau code" : "Créer l'accès"}
              </Chip>
              <Chip actif={false} onClick={() => setRecharge(l)}>
                Recharger
              </Chip>
              <Chip actif={filtre === l.id} onClick={() => setFiltre(filtre === l.id ? null : l.id)}>
                Ses avis
              </Chip>
            </div>
          </li>
        ))}
      </ul>
      {livreurs?.length === 0 && <p className="py-6 text-center font-semibold text-ink/50">Aucun livreur.</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="title-md">Avis récents{filtre ? ` · ${livreurs?.find((l) => l.id === filtre)?.nom ?? ""}` : ""}</h2>
          {filtre && (
            <Btn variant="white" onClick={() => setFiltre(null)}>
              Tous les livreurs
            </Btn>
          )}
        </div>
        {avis?.length === 0 && <p className="font-semibold text-ink/50">Aucun avis pour l&apos;instant.</p>}
        <ul className="space-y-2">
          {avis?.map((a) => (
            <li key={a.id} className={`rounded-2xl border-brut bg-white p-4 ${a.note < 3 ? "border-danger" : "border-ink"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={a.note} size={20} />
                <span className="text-sm text-ink/55">{dateHeure(a.created_at)}</span>
              </div>
              {a.commentaire && <p className="mt-2 whitespace-pre-line">{a.commentaire}</p>}
              <p className="mt-2 text-sm font-semibold text-ink/60">
                {a.livreur} · {a.code_affichage} · {a.nom_famille}
                {a.auteur ? ` (${a.auteur})` : ""} · #{a.reference}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <ModalLivreur livreur={edition} cites={cites ?? []} onClose={() => setEdition(null)} onFait={() => void reload()} />
      <ModalAcces acces={acces} onClose={() => setAcces(null)} />
      <ModalRecharge livreur={recharge} onClose={() => setRecharge(null)} onFait={() => void reload()} />
      {dialog}
    </div>
  );
}

/** Code d'accès affiché UNE seule fois + message prêt à envoyer au livreur. */
function ModalAcces({ acces, onClose }: { acces: { livreur: Livreur; code: string } | null; onClose: () => void }) {
  const [copie, setCopie] = useState(false);
  const bases = useBases();
  useEffect(() => setCopie(false), [acces]);
  if (!acces) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const lien = `${window.location.origin}${bases.livreur}`;
  const message = `Bonjour ${acces.livreur.nom}, voici ton accès livreur Distribution Eau :\n${lien}\nNuméro : ${formatPhone(acces.livreur.telephone)}\nCode provisoire : ${acces.code}\nTu choisiras ton propre code à la 1re connexion.`;
  const wa = `https://wa.me/225${acces.livreur.telephone}?text=${encodeURIComponent(message)}`;
  return (
    <Modal open onClose={onClose}>
      <ModalTitle onClose={onClose}>Accès de {acces.livreur.nom}</ModalTitle>
      <div className="space-y-4">
        <div className="rounded-2xl border-brut border-azur bg-sky p-4 text-center">
          <p className="font-semibold">Code provisoire (affiché une seule fois) :</p>
          <p className="mt-1 font-display text-5xl font-bold tracking-[0.3em]">{acces.code}</p>
        </div>
        <pre className="whitespace-pre-wrap rounded-2xl border border-ink/20 bg-white p-3 font-sans text-sm">{message}</pre>
        <div className="grid gap-2 sm:grid-cols-2">
          <LinkBtn href={wa} target="_blank" rel="noopener noreferrer" variant="azur">
            Envoyer par WhatsApp
          </LinkBtn>
          <Btn
            variant="white"
            onClick={() =>
              void navigator.clipboard?.writeText(message).then(
                () => setCopie(true),
                () => setCopie(false)
              )
            }
          >
            {copie ? "Copié ✓" : "Copier le message"}
          </Btn>
        </div>
        <p className="text-sm text-ink/60">Le livreur devra choisir son propre code à sa première connexion : celui-ci ne servira qu&apos;une fois.</p>
      </div>
    </Modal>
  );
}

function ModalRecharge({ livreur, onClose, onFait }: { livreur: Livreur | null; onClose: () => void; onFait: () => void }) {
  const [montant, setMontant] = useState("");
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => {
    setMontant("");
    setRef("");
    setMsg(null);
  }, [livreur]);

  const valider = async () => {
    if (!livreur) return;
    setMsg(null);
    try {
      const solde = await rpc<number>("admin_recharger_livreur", { p_id: livreur.id, p_montant: Number(montant), p_reference: ref || null });
      setMsg({ ok: true, t: `Recharge enregistrée. Nouveau solde : ${points(solde)}.` });
      setMontant("");
      onFait();
    } catch (e) {
      setMsg({ ok: false, t: messageErreur(e) });
    }
  };

  return (
    <Modal open={!!livreur} onClose={onClose}>
      <ModalTitle onClose={onClose}>Recharger {livreur?.nom}</ModalTitle>
      <div className="space-y-4">
        <p className="font-semibold">Solde actuel : {points(livreur?.solde_points ?? 0)}</p>
        <Field label="Montant (points = FCFA payés)">
          <input className="field" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, "").slice(0, 7))} />
        </Field>
        <Field label="Référence Wave (facultatif)">
          <input className="field" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        {msg && (msg.ok ? <SuccessBox>{msg.t}</SuccessBox> : <ErrorBox>{msg.t}</ErrorBox>)}
        <Btn size="lg" className="w-full" onClick={() => void valider()} disabled={!montant}>
          Recharger
        </Btn>
        <p className="text-center text-xs text-ink/45">Crédit non remboursable</p>
      </div>
    </Modal>
  );
}

function ModalLivreur({ livreur, cites, onClose, onFait }: { livreur: Livreur | "nouveau" | null; cites: Cite[]; onClose: () => void; onFait: () => void }) {
  const existant = livreur && livreur !== "nouveau" ? livreur : null;
  const [cite, setCite] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [prix, setPrix] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const { data: forages } = useRpc<{ id: string; nom: string; cite_id: string }[]>("admin_sources", undefined, "sources");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCite(existant?.cite_id ?? (cites.length === 1 ? cites[0].id : null));
    setNom(existant?.nom ?? "");
    setTel(existant?.telephone ?? "");
    setPrix(existant ? String(existant.prix_fcfa) : "2500");
    setSource(existant?.source_id ?? null);
    setErr(null);
  }, [livreur, existant, cites]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cite) return setErr("Choisis une cité.");
    setErr(null);
    try {
      await rpc("admin_enregistrer_livreur", { p_id: existant?.id ?? null, p_cite: cite, p_nom: nom, p_telephone: tel, p_prix: Number(prix), p_source: source });
      onFait();
      onClose();
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  return (
    <Modal open={!!livreur} onClose={onClose}>
      <ModalTitle onClose={onClose}>{existant ? "Modifier le livreur" : "Nouveau livreur"}</ModalTitle>
      <form onSubmit={enregistrer} className="space-y-4">
        <div>
          <span className="label">Cité</span>
          <ChoixCite cites={cites} value={cite} onChange={setCite} />
        </div>
        <Field label="Nom">
          <input className="field" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={40} required />
        </Field>
        <Field label="Téléphone">
          <PhoneInput value={tel} onChange={setTel} />
        </Field>
        {cite && forages?.some((f) => f.cite_id === cite) && (
          <div>
            <span className="label">Forage (facultatif)</span>
            <div className="flex flex-wrap gap-1.5">
              <Chip actif={source === null} onClick={() => setSource(null)}>
                Un peu partout
              </Chip>
              {forages
                .filter((f) => f.cite_id === cite)
                .map((f) => (
                  <Chip key={f.id} actif={source === f.id} onClick={() => setSource(f.id)}>
                    {f.nom}
                  </Chip>
                ))}
            </div>
          </div>
        )}
        <Field label="Prix de l'eau (FCFA, payé au livreur)">
          <input className="field" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value.replace(/\D/g, "").slice(0, 5))} required />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn type="submit" size="lg" className="w-full">
          Enregistrer
        </Btn>
      </form>
    </Modal>
  );
}

/** Lien secret de recrutement (V2) : à envoyer au chauffeur qu'on recrute. */
function LienRecrutement({ lien }: { lien: string }) {
  const [copie, setCopie] = useState(false);
  const complet = typeof window !== "undefined" ? `${window.location.origin}${lien}` : lien;
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(complet).then(() => setCopie(true))}
      className="mt-1 text-left text-sm font-bold text-azur hover:underline"
    >
      {copie ? "Lien de recrutement copié ✓" : "Copier le lien de recrutement (inscription des chauffeurs)"}
    </button>
  );
}
