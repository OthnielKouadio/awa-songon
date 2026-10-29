"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import SideMenu from "@/components/SideMenu";
import { SuiviLivraison, type CommandeSuivi } from "@/components/SuiviLivraison";
import { Btn, CodeInput, ErrorBox, Field, LinkBtn, Logo, Modal, ModalTitle, PhoneInput, RolePicker, Spinner, SuccessBox, roleLabel, type Role } from "@/components/ui";
import { ApiError, messageErreur, rpc } from "@/lib/api";
import { appareilPour, enregistrerAppareil, oublierAppareil, QR_VALIDE } from "@/lib/appareils";
import {
  CGV_CASE,
  EFFET_STATUT,
  MENTION_NON_REMBOURSABLE,
  STATUT_COMMANDE,
  STATUT_LIVREUR,
  WAVE_MARCHAND_DEFAUT,
  WAVE_PAY_URL,
  dateCourte,
  dateHeure,
  fcfa,
  heure,
  points,
} from "@/lib/format";
import { formatPhone, isValidPhone } from "@/lib/phone";
import { codeTropSimple, numeroDepuisCode } from "@/lib/pin";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { Consommation, Historique } from "./Historique";
import { ModePose } from "./ModePose";

// ─── Types renvoyés par le serveur (supabase/schema.sql) ─────────────────────

/** essai : essai gratuit en cours — la case « non remboursable » n'est demandée qu'à la fin de l'essai. */
type MaisonPublique = { code_affichage: string; cite: string; statut: "LIBRE" | "OCCUPEE" | "BLOQUEE"; telephone_service: string | null; essai: boolean };
type Livreur = { id: string; nom: string; prix_fcfa: number; file: number; note_moyenne: number | null; statut: string; source_nom: string | null };
type Espace = {
  canaux: { maison: string; cite: string };
  maison: { code_affichage: string; statut: string; cite: string; lat: number | null; long: number | null };
  foyer: { nom_famille: string; solde_points: number; doit_changer_code: boolean; cgv_a_accepter: boolean };
  moi: { nom: string; role: Role; est_titulaire: boolean };
  commande: (CommandeSuivi & { created_at: string; prix_fcfa: number; commande_par: string }) | null;
  derniere_livraison: { id: string; reference: string; livree_at: string; livreur_nom: string } | null;
  a_noter: { id: string; reference: string; livreur_nom: string } | null;
  cout_points: number;
  /** Dernier jour de l'essai gratuit si en cours (commandes à 0 point), sinon null. */
  essai_fin: string | null;
  telephone_service: string | null;
  wave_marchand: string | null;
  livreurs: Livreur[];
  historique: { reference: string; statut: string; created_at: string; commande_par: string }[];
};

type Phase =
  | { t: "chargement" }
  | { t: "erreur"; message: string }
  | { t: "libre"; pub: MaisonPublique }
  | { t: "bloquee"; pub: MaisonPublique }
  | { t: "ouvrir"; pub: MaisonPublique }
  | { t: "espace"; espace: Espace };

export function EspaceMaison({ qr }: { qr: string }) {
  const [phase, setPhase] = useState<Phase>({ t: "chargement" });
  // Code tapé à l'instant pour ouvrir ce téléphone : pré-rempli pour la 1re
  // commande (5 min), jamais stocké.
  const codeRecent = useRef<{ code: string; at: number } | null>(null);

  const chargerEspace = useCallback(
    async (jeton: string) => {
      try {
        const espace = await rpc<Espace>("m_espace", { p_qr: qr, p_jeton: jeton });
        setPhase({ t: "espace", espace });
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.code === "SESSION") {
          oublierAppareil(qr);
          return false;
        }
        throw e;
      }
    },
    [qr]
  );

  const charger = useCallback(async () => {
    if (!QR_VALIDE.test(qr)) return setPhase({ t: "erreur", message: messageErreur(new ApiError("INTROUVABLE")) });
    try {
      const pub = await rpc<MaisonPublique>("m_maison", { p_qr: qr });
      if (pub.statut === "LIBRE") return setPhase({ t: "libre", pub });
      const local = appareilPour(qr);
      if (local && (await chargerEspace(local.jeton))) return;
      if (pub.statut === "BLOQUEE") return setPhase({ t: "bloquee", pub });
      setPhase({ t: "ouvrir", pub });
    } catch (e) {
      // Maison supprimée (données de test effacées, nouveau QR) : on l'oublie sur ce téléphone.
      if (e instanceof ApiError && e.code === "INTROUVABLE") oublierAppareil(qr);
      setPhase({ t: "erreur", message: messageErreur(e) });
    }
  }, [qr, chargerEspace]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const rafraichir = useCallback(async () => {
    const local = appareilPour(qr);
    if (!local || !(await chargerEspace(local.jeton).catch(() => true))) void charger();
  }, [qr, chargerEspace, charger]);

  const deconnecte = useCallback(() => {
    oublierAppareil(qr);
    void charger();
  }, [qr, charger]);

  const connecte = (jeton: string, code: string, codeAffichage: string) => {
    enregistrerAppareil(qr, { jeton, code_affichage: codeAffichage });
    codeRecent.current = { code, at: Date.now() };
    setPhase({ t: "chargement" });
    void chargerEspace(jeton).catch((e) => setPhase({ t: "erreur", message: messageErreur(e) }));
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      {phase.t !== "espace" && (
        <header className="mb-5 flex items-center justify-between">
          <Logo href="/" />
        </header>
      )}
      <ModePose qr={qr} />
      {phase.t === "chargement" && <Spinner />}
      {phase.t === "erreur" && (
        <div className="space-y-4">
          <ErrorBox>{phase.message}</ErrorBox>
          <Btn variant="white" className="w-full" onClick={() => void charger()}>
            Réessayer
          </Btn>
        </div>
      )}
      {phase.t === "libre" && <CreerFoyer qr={qr} pub={phase.pub} onCree={connecte} />}
      {phase.t === "ouvrir" && <OuvrirMaison qr={qr} pub={phase.pub} onOuvert={connecte} />}
      {phase.t === "bloquee" && (
        <div className="space-y-4">
          <EnteteMaison code={phase.pub.code_affichage} cite={phase.pub.cite} />
          <ErrorBox>Cette maison est suspendue. Contacte le service Distribution Eau.</ErrorBox>
          {phase.pub.telephone_service && <AppelService tel={phase.pub.telephone_service} />}
        </div>
      )}
      {phase.t === "espace" && <EspaceFoyer qr={qr} espace={phase.espace} codeRecent={codeRecent} recharger={rafraichir} deconnecte={deconnecte} />}
    </main>
  );
}

// ─── Morceaux d'interface ────────────────────────────────────────────────────

function EnteteMaison({ code, cite, sousTitre }: { code: string; cite: string; sousTitre?: string }) {
  return (
    <div className="brut p-5 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-ink/55">Bienvenue maison</p>
      <p className="mt-1 font-display text-5xl font-bold tracking-tight">{code}</p>
      <p className="mt-2 font-semibold text-ink/70">{sousTitre ?? `Service de livraison d'eau de la cité ${cite}`}</p>
    </div>
  );
}

function AppelService({ tel }: { tel: string }) {
  return (
    <LinkBtn href={`tel:${tel}`} size="lg" className="w-full">
      <Icon name="phone" /> Appeler le service · {formatPhone(tel)}
    </LinkBtn>
  );
}

// ─── 1er scan : création du foyer ────────────────────────────────────────────

function CreerFoyer({ qr, pub, onCree }: { qr: string; pub: MaisonPublique; onCree: (jeton: string, code: string, ca: string) => void }) {
  const [famille, setFamille] = useState("");
  const [prenom, setPrenom] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [tel, setTel] = useState("");
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [cgv, setCgv] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const numero = numeroDepuisCode(pub.code_affichage);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (famille.trim().length < 2) return setErr("Indique le nom de la famille (ex. Famille Koffi).");
    if (!prenom.trim()) return setErr("Indique ton prénom.");
    if (!role) return setErr("Choisis qui tu es.");
    if (!isValidPhone(tel)) return setErr(messageErreur(new ApiError("TELEPHONE_INVALIDE")));
    if (!/^\d{4}$/.test(code)) return setErr("Le code maison fait 4 chiffres.");
    if (codeTropSimple(code, numero)) return setErr(messageErreur(new ApiError("CODE_TROP_SIMPLE")));
    if (code !== code2) return setErr("Les deux codes ne sont pas identiques.");
    if (!pub.essai && !cgv) return setErr(messageErreur(new ApiError("CGV_NON_ACCEPTEES")));
    setEnvoi(true);
    try {
      const r = await rpc<{ ok: true; jeton: string }>("m_creer_foyer", {
        p_qr: qr,
        p_nom_famille: famille,
        p_telephone: tel,
        p_nom: prenom,
        p_role: role,
        p_code: code,
        p_cgv_acceptees: cgv,
      });
      onCree(r.jeton, code, pub.code_affichage);
    } catch (e) {
      setErr(messageErreur(e));
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={soumettre} className="space-y-5" noValidate>
      <EnteteMaison code={pub.code_affichage} cite={pub.cite} />
      <div>
        <h1 className="title-md">Créer mon foyer</h1>
        <p className="mt-1 text-ink/70">Une seule fois pour toute la maison. Ta famille utilisera le même code maison.</p>
      </div>
      <Field label="Nom de la famille">
        <input className="field" value={famille} onChange={(e) => setFamille(e.target.value)} placeholder="Famille Koffi" maxLength={60} autoComplete="family-name" />
      </Field>
      <Field label="Ton prénom">
        <input className="field" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Jean" maxLength={40} autoComplete="given-name" />
      </Field>
      <div>
        <span className="label">Qui es-tu ?</span>
        <RolePicker value={role} onChange={setRole} />
      </div>
      <Field label="Téléphone principal" hint="Le livreur appelle ce numéro en cas de besoin. Tu pourras aussi te connecter avec ce numéro + le code maison.">
        <PhoneInput value={tel} onChange={setTel} />
      </Field>
      <Field label="Code maison (4 chiffres)" hint="Facile à retenir pour toute la famille, mais pas 1234, 0000 ni le numéro de la maison.">
        <CodeInput value={code} onChange={setCode} />
      </Field>
      <Field label="Retape le code maison">
        <CodeInput value={code2} onChange={setCode2} label="Confirmation du code maison" />
      </Field>
      {/* Pendant l'essai gratuit, pas de case : elle est demandée à la fin de l'essai. */}
      {!pub.essai && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-brut border-ink bg-white p-4">
          <input type="checkbox" checked={cgv} onChange={(e) => setCgv(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-azur" />
          <span className="font-semibold leading-snug">
            {CGV_CASE}{" "}
            <Link href="/cgu" className="text-azur underline" target="_blank">
              Conditions
            </Link>
          </span>
        </label>
      )}
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
        {envoi ? "Création…" : "Créer mon foyer"}
      </Btn>
    </form>
  );
}

// ─── Maison déjà inscrite : ouvrir l'accès sur ce téléphone ──────────────────

function OuvrirMaison({ qr, pub, onOuvert }: { qr: string; pub: MaisonPublique; onOuvert: (jeton: string, code: string, ca: string) => void }) {
  const [code, setCode] = useState("");
  const [prenom, setPrenom] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [tel, setTel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(code)) return setErr("Le code maison fait 4 chiffres.");
    if (!prenom.trim()) return setErr("Indique ton prénom.");
    if (!role) return setErr("Choisis qui tu es.");
    if (tel && !isValidPhone(tel)) return setErr(messageErreur(new ApiError("TELEPHONE_INVALIDE")));
    setEnvoi(true);
    try {
      const r = await rpc<{ ok: true; jeton: string }>("m_ouvrir", { p_qr: qr, p_code: code, p_nom: prenom, p_role: role, p_telephone: tel || null });
      onOuvert(r.jeton, code, pub.code_affichage);
    } catch (e) {
      setErr(messageErreur(e));
      setCode("");
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={soumettre} className="space-y-5" noValidate>
      <EnteteMaison code={pub.code_affichage} cite={pub.cite} />
      <div>
        <h1 className="title-md">Entre le code maison</h1>
        <p className="mt-1 text-ink/70">Ta famille est déjà inscrite. Demande-lui le code à 4 chiffres.</p>
      </div>
      <CodeInput value={code} onChange={setCode} autoFocus />
      <Field label="Ton prénom">
        <input className="field" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Awa" maxLength={40} autoComplete="given-name" />
      </Field>
      <div>
        <span className="label">Qui es-tu ?</span>
        <RolePicker value={role} onChange={setRole} />
      </div>
      <Field label="Ton numéro (facultatif)" hint="Pour que le livreur puisse t'appeler, et pour te connecter avec ton numéro + le code maison.">
        <PhoneInput value={tel} onChange={setTel} required={false} />
      </Field>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
        {envoi ? "Vérification…" : "Accéder à ma maison"}
      </Btn>
      {pub.telephone_service && (
        <p className="text-center text-sm text-ink/60">
          Code oublié ? Le titulaire appelle le service au{" "}
          <a className="font-bold text-azur" href={`tel:${pub.telephone_service}`}>
            {formatPhone(pub.telephone_service)}
          </a>
          .
        </p>
      )}
    </form>
  );
}

// ─── Espace du foyer ─────────────────────────────────────────────────────────

const VU_KEY = "distribution-eau:livre-vu";
const livraisonVue = (id: string) => {
  try {
    return localStorage.getItem(VU_KEY) === id;
  } catch {
    return false;
  }
};

function EspaceFoyer({
  qr,
  espace,
  codeRecent,
  recharger,
  deconnecte,
}: {
  qr: string;
  espace: Espace;
  codeRecent: React.MutableRefObject<{ code: string; at: number } | null>;
  recharger: () => Promise<void>;
  deconnecte: () => void;
}) {
  const { maison, foyer, moi, commande, livreurs, cout_points, essai_fin, telephone_service, a_noter, historique, derniere_livraison, canaux } = espace;
  const [choix, setChoix] = useState<Livreur | null>(null);
  const [rechargeOuverte, setRechargeOuverte] = useState(false);
  const [vue, setVue] = useState<"historique" | "conso" | "code" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [livreVu, setLivreVu] = useState(true);

  // Temps réel : la commande de la maison et la liste des livreurs de la cité.
  useLiveRefresh([`maison:${canaux.maison}`, `cite:${canaux.cite}`], () => void recharger(), commande ? 15000 : 30000);

  // Écran « Livré ! » : affiché une fois par livraison, fermé par la famille.
  useEffect(() => {
    setLivreVu(!derniere_livraison || livraisonVue(derniere_livraison.id));
  }, [derniere_livraison]);

  const jeton = () => appareilPour(qr)?.jeton ?? "";

  const annuler = async (id: string) => {
    setErr(null);
    try {
      await rpc("m_annuler", { p_qr: qr, p_jeton: jeton(), p_commande: id });
      await recharger();
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  const seDeconnecter = async () => {
    try {
      await rpc("m_deconnecter", { p_qr: qr, p_jeton: jeton() });
    } catch {}
    deconnecte();
  };

  const partagerSuivi = async () => {
    if (!commande) return setInfo("Aucune commande en cours à partager.");
    const lien = `${window.location.origin}/suivi/${commande.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Suivi de livraison", url: lien });
      else {
        await navigator.clipboard.writeText(lien);
        setInfo("Lien de suivi copié : colle-le dans un message.");
      }
    } catch {}
  };

  const soldeOk = foyer.solde_points >= cout_points;

  // Clients repris de la V2 : accepter d'abord la clause « non remboursable ».
  if (foyer.cgv_a_accepter) return <AccepterCgv qr={qr} onOk={() => void recharger()} code={maison.code_affichage} />;
  // Code donné par l'admin (oubli) : choisir un nouveau code.
  if (foyer.doit_changer_code) return <ChangerCode qr={qr} provisoire onOk={() => void recharger()} />;

  // « Livré ! » (V2) : écran à fermer soi-même avant de recommander.
  if (!commande && derniere_livraison && !livreVu) {
    return (
      <div className="space-y-6 pt-6 text-center">
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-azur text-white shadow-hard">
          <Icon name="check" size={48} />
        </div>
        <h1 className="title-xl !text-5xl">Livré ! Bois bien.</h1>
        <p className="text-lg text-ink/70">
          {derniere_livraison.livreur_nom} a livré {maison.code_affichage} à {heure(derniere_livraison.livree_at)}.
        </p>
        {a_noter?.id === derniere_livraison.id && (
          <LinkBtn href={`/avis/${a_noter.id}?m=${qr}`} variant="white" size="lg" className="w-full">
            ★ Noter la livraison
          </LinkBtn>
        )}
        <Btn
          size="lg"
          className="w-full"
          onClick={() => {
            try {
              localStorage.setItem(VU_KEY, derniere_livraison.id);
            } catch {}
            setLivreVu(true);
          }}
        >
          Commander à nouveau
        </Btn>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Logo href="/" />
        <SideMenu
          titre={foyer.nom_famille}
          sousTitre={`${maison.code_affichage} · ${moi.nom} (${roleLabel(moi.role)})`}
          onLogout={() => void seDeconnecter()}
          items={[
            { icon: "clock", label: "Historique des commandes", onClick: () => setVue("historique") },
            { icon: "layers", label: "Consommation par mois", onClick: () => setVue("conso") },
            { icon: "nav", label: "Partager le suivi", hint: "Lien pour suivre la livraison sans compte", onClick: () => void partagerSuivi() },
            { icon: "lock", label: "Changer le code maison", onClick: () => setVue("code") },
            { icon: "money", label: "Recharger", hint: MENTION_NON_REMBOURSABLE, onClick: () => setRechargeOuverte(true) },
            { icon: "chat", label: "Donner mon avis", onClick: () => (window.location.href = `/avis-plateforme?m=${qr}`) },
          ]}
        >
          {/* Solde et essai gratuit : dans le menu, pas sur la page de commande. */}
          <div className="space-y-2 rounded-2xl border-brut border-ink bg-white p-4">
            <p className="label !mb-0">Solde du foyer</p>
            <p className="font-display text-3xl font-bold">{points(foyer.solde_points)}</p>
            {essai_fin && (
              <p className="rounded-xl bg-sky p-2 text-sm font-bold">
                Essai gratuit jusqu&apos;au {dateCourte(essai_fin)} : tes commandes ne coûtent aucun point.
              </p>
            )}
          </div>
        </SideMenu>
      </header>

      <EnteteMaison code={maison.code_affichage} cite={maison.cite} sousTitre={`${foyer.nom_famille} · ${moi.nom} (${roleLabel(moi.role)})`} />

      {maison.statut === "BLOQUEE" && <ErrorBox>Cette maison est suspendue : les commandes sont bloquées. Contacte le service.</ErrorBox>}

      {a_noter && (
        <Link
          href={`/avis/${a_noter.id}?m=${qr}`}
          className="flex items-center justify-between gap-3 rounded-2xl border-brut border-azur bg-sky p-4 font-bold text-ink transition-colors hover:bg-white"
        >
          <span>Comment s&apos;est passée ta livraison avec {a_noter.livreur_nom} ?</span>
          <span className="shrink-0 text-azur">Noter ★</span>
        </Link>
      )}

      {err && <ErrorBox>{err}</ErrorBox>}
      {info && <SuccessBox>{info}</SuccessBox>}

      {commande ? (
        <SuiviLivraison c={commande} maison={{ lat: maison.lat, long: maison.long, code_affichage: maison.code_affichage }} onAnnuler={() => void annuler(commande.id)} />
      ) : (
        <section className="space-y-3">
          <h2 className="title-md">Commander de l&apos;eau</h2>
          <p className="text-ink/70">
            Livraison à <strong>{maison.code_affichage}</strong>, même si tu commandes depuis ailleurs. Choisis ton livreur :
          </p>
          {livreurs.length === 0 && <p className="rounded-2xl border-brut border-dashed border-ink/40 p-4 text-center font-semibold text-ink/60">Aucun livreur disponible pour l&apos;instant.</p>}
          {livreurs.map((l) => (
            <button
              key={l.id}
              onClick={() => setChoix(l)}
              disabled={maison.statut === "BLOQUEE"}
              className="flex w-full items-center justify-between gap-3 rounded-brut border-brut border-ink bg-white p-4 text-left shadow-hard-sm transition-colors hover:bg-sky disabled:opacity-40"
            >
              <span className="flex items-center gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${l.statut === "ACTIF" ? "bg-azur text-white" : "bg-steel/50 text-ink/60"}`}>
                  <Icon name="truck" size={26} />
                </span>
                <span>
                  <span className="block text-lg font-bold">{l.nom}</span>
                  <span className="block text-sm font-semibold text-ink/60">
                    {STATUT_LIVREUR[l.statut]} · {EFFET_STATUT[l.statut]}
                  </span>
                  <span className="text-sm text-ink/55">
                    {l.note_moyenne !== null && <>★ {Number(l.note_moyenne).toFixed(1)} · </>}
                    {l.file === 0 ? "Personne avant toi" : `${l.file} commande${l.file > 1 ? "s" : ""} avant toi`}
                    {l.source_nom ? ` · ${l.source_nom}` : ""}
                  </span>
                </span>
              </span>
              <span className="shrink-0 font-display text-lg font-bold">{fcfa(l.prix_fcfa)}</span>
            </button>
          ))}
        </section>
      )}

      {historique.length > 0 && (
        <section>
          <h2 className="label">Dernières commandes</h2>
          <ul className="divide-y divide-ink/10 rounded-2xl border-brut border-ink bg-white">
            {historique.map((h) => (
              <li key={h.reference} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <strong>#{h.reference}</strong> · {h.commande_par}
                </span>
                <span className="text-ink/60">
                  {STATUT_COMMANDE[h.statut] ?? h.statut} · {dateHeure(h.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ModalCommande
        qr={qr}
        livreur={choix}
        espace={espace}
        soldeOk={soldeOk}
        codeRecent={codeRecent}
        onClose={() => setChoix(null)}
        onRecharge={() => {
          setChoix(null);
          setRechargeOuverte(true);
        }}
        onCommande={async () => {
          setChoix(null);
          await recharger();
        }}
      />
      <ModalRecharge open={rechargeOuverte} onClose={() => setRechargeOuverte(false)} code={maison.code_affichage} tel={telephone_service} marchand={espace.wave_marchand} />
      <Modal open={vue === "historique"} onClose={() => setVue(null)} wide>
        <ModalTitle onClose={() => setVue(null)}>Historique</ModalTitle>
        {vue === "historique" && <Historique qr={qr} />}
      </Modal>
      <Modal open={vue === "conso"} onClose={() => setVue(null)} wide>
        <ModalTitle onClose={() => setVue(null)}>Consommation</ModalTitle>
        {vue === "conso" && <Consommation qr={qr} />}
      </Modal>
      <Modal open={vue === "code"} onClose={() => setVue(null)}>
        <ModalTitle onClose={() => setVue(null)}>Changer le code maison</ModalTitle>
        {vue === "code" && (
          <ChangerCode
            qr={qr}
            onOk={() => {
              setVue(null);
              setInfo("Nouveau code enregistré. Préviens ta famille !");
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ModalCommande({
  qr,
  livreur,
  espace,
  soldeOk,
  codeRecent,
  onClose,
  onRecharge,
  onCommande,
}: {
  qr: string;
  livreur: Livreur | null;
  espace: Espace;
  soldeOk: boolean;
  codeRecent: React.MutableRefObject<{ code: string; at: number } | null>;
  onClose: () => void;
  onRecharge: () => void;
  onCommande: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [demain, setDemain] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!livreur) return;
    const r = codeRecent.current;
    setCode(r && Date.now() - r.at < 5 * 60_000 ? r.code : "");
    setDemain(false);
    setErr(null);
  }, [livreur, codeRecent]);

  const valider = async () => {
    if (!livreur) return;
    if (!/^\d{4}$/.test(code)) return setErr("Tape le code maison (4 chiffres).");
    setEnvoi(true);
    setErr(null);
    try {
      await rpc("m_commander", { p_qr: qr, p_jeton: appareilPour(qr)?.jeton ?? "", p_code: code, p_livreur: livreur.id, p_demain: demain });
      codeRecent.current = null;
      await onCommande();
    } catch (e) {
      setErr(messageErreur(e));
      setCode("");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={!!livreur} onClose={onClose}>
      {livreur && (
        <>
          <ModalTitle onClose={onClose}>Confirmer</ModalTitle>
          {/* Aujourd'hui ou demain, aucune autre date (V2). */}
          <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jour de livraison">
            {[
              { v: false, l: "Aujourd'hui" },
              { v: true, l: "Demain" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={demain === o.v}
                onClick={() => setDemain(o.v)}
                className={`rounded-2xl border-brut border-ink py-3 text-lg font-bold ${demain === o.v ? "bg-ink text-white" : "bg-white hover:bg-sky"}`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <dl className="space-y-2 rounded-2xl border-brut border-ink bg-white p-4">
            <Ligne k="Livrer à" v={espace.maison.code_affichage} fort />
            <Ligne k="Livreur" v={`${livreur.nom} · ${STATUT_LIVREUR[livreur.statut]}`} />
            <Ligne k="Quand" v={demain ? "Demain à partir de 8h" : EFFET_STATUT[livreur.statut]} />
            <Ligne k="Eau (à payer au livreur)" v={fcfa(livreur.prix_fcfa)} />
            <Ligne k="Service Distribution Eau" v={espace.essai_fin ? "Gratuit (essai)" : points(espace.cout_points)} />
            <Ligne k="Ton solde" v={points(espace.foyer.solde_points)} />
          </dl>
          {demain && <p className="mt-2 text-sm text-ink/60">Annulable jusqu&apos;à 18h ce soir.</p>}
          {soldeOk ? (
            <div className="mt-5 space-y-4">
              <CodeInput value={code} onChange={setCode} autoFocus />
              {err && <ErrorBox>{err}</ErrorBox>}
              <Btn size="lg" className="w-full" onClick={() => void valider()} disabled={envoi}>
                {envoi ? "Envoi…" : "Valider la commande"}
              </Btn>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <ErrorBox>Solde insuffisant : il faut {points(espace.cout_points)} pour commander.</ErrorBox>
              <Btn variant="azur" size="lg" className="w-full" onClick={onRecharge}>
                Recharger
              </Btn>
              <p className="text-center text-xs text-ink/45">{MENTION_NON_REMBOURSABLE}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function Ligne({ k, v, fort }: { k: string; v: string; fort?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink/60">{k}</dt>
      <dd className={`text-right ${fort ? "font-display text-xl font-bold" : "font-bold"}`}>{v}</dd>
    </div>
  );
}

/** Recharge (V2) : paiement Wave marchand, puis crédit par le service. */
function ModalRecharge({ open, onClose, code, tel, marchand }: { open: boolean; onClose: () => void; code: string; tel: string | null; marchand: string | null }) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalTitle onClose={onClose}>Recharger</ModalTitle>
      <ol className="space-y-3 text-lg">
        <li>
          <strong>1.</strong> Paie avec Wave
          {WAVE_PAY_URL ? (
            <>
              {" "}
              (marchand <strong>{marchand || WAVE_MARCHAND_DEFAUT}</strong> : vérifie ce nom sur l&apos;écran Wave)
            </>
          ) : tel ? (
            <>
              {" "}
              au <strong>{formatPhone(tel)}</strong>
            </>
          ) : null}
          .
        </li>
        <li>
          <strong>2.</strong> Appelle le service en donnant ton code maison <strong>{code}</strong>.
        </li>
        <li>
          <strong>3.</strong> Tes points arrivent sur le compte du foyer (1 FCFA = 1 point).
        </li>
      </ol>
      <div className="mt-6 space-y-2">
        {WAVE_PAY_URL && (
          <LinkBtn href={WAVE_PAY_URL} target="_blank" rel="noopener noreferrer" variant="azur" size="lg" className="w-full">
            Payer avec Wave
          </LinkBtn>
        )}
        {tel && (
          <LinkBtn href={`tel:${tel}`} size="lg" className="w-full">
            <Icon name="phone" /> Appeler le service · {formatPhone(tel)}
          </LinkBtn>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-ink/45">{MENTION_NON_REMBOURSABLE}</p>
    </Modal>
  );
}

/** Choisir un nouveau code maison (obligatoire après un code provisoire). */
function ChangerCode({ qr, provisoire, onOk }: { qr: string; provisoire?: boolean; onOk: () => void }) {
  const [ancien, setAncien] = useState("");
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const numero = numeroDepuisCode(appareilPour(qr)?.code_affichage ?? "");

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(ancien)) return setErr(provisoire ? "Tape le code donné par le service." : "Tape le code maison actuel.");
    if (!/^\d{4}$/.test(code)) return setErr("Le nouveau code fait 4 chiffres.");
    if (codeTropSimple(code, numero)) return setErr(messageErreur(new ApiError("CODE_TROP_SIMPLE")));
    if (code !== code2) return setErr("Les deux codes ne sont pas identiques.");
    setEnvoi(true);
    try {
      await rpc("m_changer_code", { p_qr: qr, p_jeton: appareilPour(qr)?.jeton ?? "", p_ancien: ancien, p_nouveau: code });
      onOk();
    } catch (e) {
      setErr(messageErreur(e));
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={valider} className="space-y-4">
      {provisoire && (
        <div>
          <h1 className="title-md">Choisis un nouveau code maison</h1>
          <p className="mt-1 text-ink/70">Le service t&apos;a donné un code provisoire. Choisis-en un pour toute la famille.</p>
        </div>
      )}
      <Field label={provisoire ? "Code provisoire" : "Code actuel"}>
        <CodeInput value={ancien} onChange={setAncien} label="Code actuel" />
      </Field>
      <Field label="Nouveau code">
        <CodeInput value={code} onChange={setCode} label="Nouveau code" />
      </Field>
      <Field label="Retape le nouveau code">
        <CodeInput value={code2} onChange={setCode2} label="Confirmation" />
      </Field>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
        {envoi ? "Enregistrement…" : "Enregistrer le code"}
      </Btn>
    </form>
  );
}

/** Fin de l'essai gratuit (ou client repris de la V2) : accepter la clause
 *  « crédits non remboursables » avant la 1re commande payante. */
function AccepterCgv({ qr, code, onOk }: { qr: string; code: string; onOk: () => void }) {
  const [coche, setCoche] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-5 pt-4">
      <EnteteMaison code={code} cite="" sousTitre="L'essai gratuit est terminé" />
      <p className="text-lg">Les commandes utilisent maintenant des points. Avant de continuer, une seule chose à accepter :</p>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-brut border-ink bg-white p-4">
        <input type="checkbox" checked={coche} onChange={(e) => setCoche(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-azur" />
        <span className="font-semibold leading-snug">
          {CGV_CASE}{" "}
          <Link href="/cgu" className="text-azur underline" target="_blank">
            Conditions
          </Link>
        </span>
      </label>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn
        size="lg"
        className="w-full"
        disabled={!coche}
        onClick={async () => {
          try {
            await rpc("m_accepter_cgv", { p_qr: qr, p_jeton: appareilPour(qr)?.jeton ?? "" });
            onOk();
          } catch (e) {
            setErr(messageErreur(e));
          }
        }}
      >
        Continuer
      </Btn>
    </div>
  );
}
