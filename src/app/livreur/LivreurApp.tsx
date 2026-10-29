"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import SideMenu from "@/components/SideMenu";
import { Badge, Btn, CodeInput, ErrorBox, Field, LinkBtn, Logo, Modal, ModalTitle, PhoneInput, Spinner, SuccessBox, roleLabel, useConfirm } from "@/components/ui";
import { ApiError, messageErreur, rpc } from "@/lib/api";
import { BONUS_FIDELITE_POINTS, SEUIL_FIDELITE, STATUT_COMMANDE, dateCourte, dateHeure, fcfa, formatProgrammee, points } from "@/lib/format";
import { lienItineraire, positionActuelle } from "@/lib/gps";
import { ecrireJetonLivreur as ecrireJeton, lireJetonLivreur as lireJeton } from "@/lib/livreurSession";
import { formatPhone, isValidPhone } from "@/lib/phone";
import { codeTropSimple } from "@/lib/pin";
import { playNotification, unlockAudio } from "@/lib/sound";
import { useGeoWatch } from "@/lib/useGeoWatch";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

// ─── Types renvoyés par l_espace (supabase/schema.sql) ───────────────────────

type CommandeFile = {
  id: string;
  reference: string;
  statut: "EN_ATTENTE" | "EN_PAUSE" | "PROGRAMMEE" | "EN_ROUTE" | "ARRIVE";
  source: "APP" | "LIVREUR";
  created_at: string;
  scheduled_for: string;
  programmee_pour: string | null;
  arriving_at: string | null;
  code_affichage: string;
  nom_famille: string;
  commande_par: string;
  role_commande: string | null;
  telephone_contact: string | null;
  note: string | null;
  prix_fcfa: number;
  position: number;
  lat: number | null;
  long: number | null;
  foyer_a_verifier: boolean;
};
type Statut = "ACTIF" | "PAUSE" | "HORS_LIGNE";
type Espace = {
  doit_changer_code: false;
  profil: {
    id: string;
    nom: string;
    cite: string;
    code_court: string;
    statut: Statut;
    valide: boolean;
    prix_fcfa: number;
    solde_points: number;
    total_points_utilises: number;
    dernier_bonus_at: string | null;
    source_nom: string | null;
    note_moyenne: number | null;
    total_avis: number;
    essai_fin: string | null;
    cout_points: number;
    points_insuffisants: boolean;
  };
  telephone_service: string | null;
  livrees_aujourdhui: number;
  gains_aujourdhui: number;
  file: CommandeFile[];
};
type Reponse = Espace | { doit_changer_code: true; nom: string };

type Etat = { t: "chargement" } | { t: "connexion" } | { t: "changer_code"; nom: string } | { t: "espace"; espace: Espace } | { t: "erreur"; msg: string };

export function LivreurApp({ base }: { base: string }) {
  const [etat, setEtat] = useState<Etat>({ t: "chargement" });
  // Code provisoire tapé à la connexion : pré-rempli pour le changement (jamais stocké).
  const codeTape = useRef("");

  const charger = useCallback(async () => {
    const jeton = lireJeton();
    if (!jeton) return setEtat({ t: "connexion" });
    try {
      const r = await rpc<Reponse>("l_espace", { p_jeton: jeton });
      setEtat(r.doit_changer_code ? { t: "changer_code", nom: r.nom } : { t: "espace", espace: r });
    } catch (e) {
      if (e instanceof ApiError && (e.code === "SESSION" || e.code === "LIVREUR_BLOQUE")) {
        ecrireJeton(null);
        setEtat(e.code === "SESSION" ? { t: "connexion" } : { t: "erreur", msg: e.message });
      } else setEtat((prev) => (prev.t === "espace" ? prev : { t: "erreur", msg: messageErreur(e) }));
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const deconnexion = async () => {
    const j = lireJeton();
    ecrireJeton(null);
    if (j) await rpc("l_deconnecter", { p_jeton: j }).catch(() => {});
    setEtat({ t: "connexion" });
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-4">
      {etat.t !== "espace" && (
        <header className="mb-5 flex items-center justify-between">
          <Logo href={base} />
          {etat.t === "changer_code" && (
            <button onClick={() => void deconnexion()} className="flex items-center gap-1.5 text-sm font-bold text-ink/55 hover:text-danger">
              <Icon name="logout" size={18} /> Déconnexion
            </button>
          )}
        </header>
      )}
      {etat.t === "chargement" && <Spinner />}
      {etat.t === "erreur" && (
        <div className="space-y-4">
          <ErrorBox>{etat.msg}</ErrorBox>
          <Btn variant="white" className="w-full" onClick={() => void charger()}>
            Réessayer
          </Btn>
        </div>
      )}
      {etat.t === "connexion" && (
        <Connexion
          onOk={(jeton, code) => {
            ecrireJeton(jeton);
            codeTape.current = code;
            setEtat({ t: "chargement" });
            void charger();
          }}
        />
      )}
      {etat.t === "changer_code" && (
        <ChangerCode
          nom={etat.nom}
          ancien={codeTape.current}
          onOk={() => {
            codeTape.current = "";
            void charger();
          }}
        />
      )}
      {etat.t === "espace" && <Tableau base={base} espace={etat.espace} recharger={charger} deconnexion={() => void deconnexion()} />}
    </main>
  );
}

// ─── Connexion ───────────────────────────────────────────────────────────────

function Connexion({ onOk }: { onOk: (jeton: string, code: string) => void }) {
  const [tel, setTel] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!isValidPhone(tel)) return setErr(messageErreur(new ApiError("TELEPHONE_INVALIDE")));
    if (!/^\d{4}$/.test(code)) return setErr("Le code fait 4 chiffres.");
    setEnvoi(true);
    try {
      const r = await rpc<{ ok: true; jeton: string }>("l_connexion", { p_telephone: tel, p_code: code });
      onOk(r.jeton, code);
    } catch (e) {
      setErr(messageErreur(e));
      setCode("");
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={soumettre} className="space-y-5">
      <div>
        <h1 className="title-lg">Espace livreur</h1>
        <p className="mt-2 text-ink/70">Connecte-toi avec ton numéro et ton code.</p>
      </div>
      <Field label="Ton numéro">
        <PhoneInput value={tel} onChange={setTel} />
      </Field>
      <Field label="Code à 4 chiffres">
        <CodeInput value={code} onChange={setCode} label="Code livreur" />
      </Field>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
        {envoi ? "Connexion…" : "Se connecter"}
      </Btn>
      <p className="text-center text-sm text-ink/55">Pas de code ou code oublié ? Demande-le à l&apos;administrateur.</p>
    </form>
  );
}

function ChangerCode({ nom, ancien, onOk }: { nom: string; ancien: string; onOk: () => void }) {
  const [actuel, setActuel] = useState(ancien);
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(actuel)) return setErr("Tape le code provisoire reçu de l'administrateur.");
    if (!/^\d{4}$/.test(code)) return setErr("Ton nouveau code fait 4 chiffres.");
    if (codeTropSimple(code)) return setErr(messageErreur(new ApiError("CODE_TROP_SIMPLE")));
    if (code !== code2) return setErr("Les deux codes ne sont pas identiques.");
    setEnvoi(true);
    try {
      await rpc("l_changer_code", { p_jeton: lireJeton(), p_ancien: actuel, p_nouveau: code });
      onOk();
    } catch (e) {
      setErr(messageErreur(e));
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={soumettre} className="space-y-5">
      <div>
        <h1 className="title-md">Bienvenue {nom} !</h1>
        <p className="mt-2 text-ink/70">Choisis ton code personnel. Ne le donne à personne, même pas à l&apos;administrateur.</p>
      </div>
      {!ancien && (
        <Field label="Code provisoire">
          <CodeInput value={actuel} onChange={setActuel} label="Code provisoire" />
        </Field>
      )}
      <Field label="Nouveau code">
        <CodeInput value={code} onChange={setCode} label="Nouveau code" />
      </Field>
      <Field label="Retape le nouveau code">
        <CodeInput value={code2} onChange={setCode2} label="Confirmation du nouveau code" />
      </Field>
      {err && <ErrorBox>{err}</ErrorBox>}
      <Btn type="submit" size="lg" className="w-full" disabled={envoi}>
        {envoi ? "Enregistrement…" : "Enregistrer mon code"}
      </Btn>
    </form>
  );
}

// ─── Tableau de bord ─────────────────────────────────────────────────────────

const BONUS_VU = "distribution-eau:bonus-vu";

function Tableau({ base, espace, recharger, deconnexion }: { base: string; espace: Espace; recharger: () => Promise<void>; deconnexion: () => void }) {
  const { profil, file, telephone_service, livrees_aujourdhui, gains_aujourdhui } = espace;
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saisie, setSaisie] = useState(false);
  const [vue, setVue] = useState<"prix" | "stats" | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [bonus, setBonus] = useState(false);
  const { confirm, dialog } = useConfirm();
  const vus = useRef<Set<string> | null>(null);
  const jeton = () => lireJeton() ?? "";

  // Temps réel : sa file (livreur:<id>). Son + vibration quand une commande arrive.
  useLiveRefresh([`livreur:${profil.id}`], () => void recharger(), 15000);
  useEffect(() => {
    const ids = new Set(file.map((c) => c.id));
    if (vus.current && file.some((c) => !vus.current!.has(c.id))) playNotification();
    vus.current = ids;
  }, [file]);

  // Fidélité : toast « Bravo » une fois par bonus.
  useEffect(() => {
    if (!profil.dernier_bonus_at) return;
    try {
      if (localStorage.getItem(BONUS_VU) === profil.dernier_bonus_at) return;
      localStorage.setItem(BONUS_VU, profil.dernier_bonus_at);
    } catch {}
    if (Date.now() - new Date(profil.dernier_bonus_at).getTime() < 7 * 86400000) {
      setBonus(true);
      setTimeout(() => setBonus(false), 6000);
    }
  }, [profil.dernier_bonus_at]);

  // GPS en direct : UNIQUEMENT pendant « J'arrive chez toi » (10 min max).
  const arrivee = file.find((c) => c.statut === "ARRIVE") ?? null;
  useGeoWatch(!!arrivee, arrivee?.id ?? null, async (lat, lng) => {
    try {
      const r = await rpc<{ actif: boolean }>("l_position", { p_jeton: jeton(), p_lat: lat, p_long: lng });
      return r.actif;
    } catch {
      return false;
    }
  });

  const agir = async (cle: string, fn: () => Promise<string | void>) => {
    unlockAudio();
    setErr(null);
    setInfo(null);
    setOccupe(cle);
    try {
      const msg = await fn();
      if (msg) setInfo(msg);
      await recharger();
    } catch (e) {
      setErr(messageErreur(e));
    } finally {
      setOccupe(null);
    }
  };

  const changerStatut = (s: Statut) =>
    agir("statut", async () => {
      if (s === "HORS_LIGNE" && !(await confirm("Sûr de vouloir passer hors ligne ? Les nouvelles commandes seront programmées demain 8h.", { confirmLabel: "Passer hors ligne" })))
        return;
      await rpc("l_statut", { p_jeton: jeton(), p_statut: s });
    });

  // Compte pas encore validé (recrutement) : page d'attente.
  if (!profil.valide) {
    return (
      <div className="space-y-5 pt-2">
        <header className="flex items-center justify-between">
          <Logo href={base} />
          <button onClick={deconnexion} className="text-sm font-bold text-ink/55 hover:text-danger">
            Déconnexion
          </button>
        </header>
        <div className="brut space-y-3 p-6 text-center">
          <Icon name="clock" size={40} className="mx-auto text-azur" />
          <h1 className="title-md">Compte en attente de validation</h1>
          <p className="text-ink/70">L&apos;administrateur doit vérifier ton identité et ton tricycle avant que tu puisses recevoir des commandes.</p>
          {telephone_service && (
            <LinkBtn href={`tel:${telephone_service}`} size="lg" className="w-full">
              <Icon name="phone" /> Appeler l&apos;administrateur
            </LinkBtn>
          )}
        </div>
      </div>
    );
  }

  const bloquePoints = profil.points_insuffisants && !profil.essai_fin;
  const aujourdhui = file.filter((c) => c.statut !== "PROGRAMMEE");
  const programmees = file.filter((c) => c.statut === "PROGRAMMEE");
  const enCours = file.find((c) => c.statut === "EN_ROUTE" || c.statut === "ARRIVE") ?? null;
  const prochaine = file.find((c) => c.statut === "EN_ATTENTE") ?? null;

  // Après l'essai, sous le minimum : page bloquante (V2), sauf livraisons déjà en cours.
  if (bloquePoints && aujourdhui.length === 0) {
    return (
      <div className="space-y-5 pt-2">
        <header className="flex items-center justify-between">
          <Logo href={base} />
          <button onClick={deconnexion} className="text-sm font-bold text-ink/55 hover:text-danger">
            Déconnexion
          </button>
        </header>
        <div className="space-y-4 rounded-brut border-brut border-danger bg-white p-6">
          <p className="font-display text-3xl font-bold text-danger">Solde épuisé</p>
          <p className="text-lg">
            Rechargez par Wave{telephone_service ? <> au <strong>{formatPhone(telephone_service)}</strong></> : null} pour continuer. Minimum 1000 F (1000 points).
          </p>
          <p className="font-semibold">Solde actuel : {points(profil.solde_points)}</p>
          <p className="text-sm text-ink/60">En attendant, tu n&apos;apparais plus aux clients.</p>
          {telephone_service && (
            <LinkBtn href={`tel:${telephone_service}`} size="lg" className="w-full">
              <Icon name="phone" /> Appeler le service
            </LinkBtn>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Logo href={base} />
        <SideMenu
          titre={profil.nom}
          sousTitre={`Cité ${profil.cite}${profil.source_nom ? ` · ${profil.source_nom}` : ""}`}
          onLogout={deconnexion}
          items={[
            { icon: "money", label: "Mon prix", hint: `${fcfa(profil.prix_fcfa)} les 1000 L`, onClick: () => setVue("prix") },
            { icon: "layers", label: "Mes statistiques", onClick: () => setVue("stats") },
            { icon: "plus", label: "Saisie directe", hint: "Client qui t'appelle", onClick: () => setSaisie(true) },
          ]}
        >
          {/* Solde, fidélité et essai : dans le menu, pas sur la page de travail. */}
          <div className="space-y-1.5 rounded-2xl border-brut border-ink bg-white p-4">
            <p className="label !mb-0">Mon solde</p>
            <p className="font-display text-3xl font-bold">{points(profil.solde_points)}</p>
            <p className="text-sm text-ink/60">{points(profil.cout_points)} par commande</p>
            <p className="text-xs text-ink/55">
              Fidélité : {points(profil.total_points_utilises)} / {points(SEUIL_FIDELITE)} → +{BONUS_FIDELITE_POINTS} offerts
            </p>
            {profil.essai_fin && <p className="rounded-xl bg-sky p-2 text-sm font-bold">Essai gratuit jusqu&apos;au {dateCourte(profil.essai_fin)} : aucun point débité.</p>}
          </div>
        </SideMenu>
      </header>

      <AnimatePresence>
        {bonus && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border-brut border-ink bg-azur p-4 text-center font-bold text-white shadow-hard">
            Bravo ! 1 livraison gratuite offerte (+{BONUS_FIDELITE_POINTS} pts)
          </motion.div>
        )}
      </AnimatePresence>

      {/* Statut : 3 boutons (V2) */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => void changerStatut(profil.statut === "ACTIF" ? "PAUSE" : "ACTIF")}
            disabled={occupe === "statut" || bloquePoints}
            className={`col-span-2 flex items-center justify-center gap-3 rounded-2xl border-brut border-ink py-6 font-display text-3xl font-bold text-white shadow-hard transition-colors disabled:opacity-50 ${
              profil.statut === "ACTIF" ? "bg-pause" : "bg-reprise"
            }`}
          >
            <Icon name={profil.statut === "ACTIF" ? "pause" : "play"} size={30} />
            {profil.statut === "ACTIF" ? "PAUSE" : "REPRENDRE"}
          </button>
        </div>
        <p className="text-center font-semibold">
          {profil.statut === "ACTIF"
            ? "En service : les commandes entrent dans ta file."
            : profil.statut === "PAUSE"
            ? "En pause : les clients sont livrés aujourd'hui, dès que tu reprends."
            : "Hors ligne : les nouvelles commandes sont programmées demain 8h."}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Chiffre v={String(livrees_aujourdhui)} k="Livrées aujourd'hui" />
        <Chiffre v={fcfa(gains_aujourdhui)} k="Gagné aujourd'hui" />
        <Chiffre v={profil.note_moyenne !== null ? `★ ${Number(profil.note_moyenne).toFixed(1)}` : "–"} k={`${profil.total_avis} avis`} />
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}
      {info && <SuccessBox>{info}</SuccessBox>}

      {/* Livraison en cours */}
      {enCours && (
        <CarteCommande c={enCours} principale>
          {enCours.statut === "EN_ROUTE" ? (
            <Btn
              size="lg"
              className="w-full !py-5 !text-xl"
              disabled={!!occupe}
              onClick={() => void agir(enCours.id, () => rpc("l_avancer", { p_jeton: jeton(), p_commande: enCours.id, p_statut: "ARRIVE" }))}
            >
              <Icon name="pin" /> J&apos;ARRIVE CHEZ TOI
            </Btn>
          ) : (
            <p className="rounded-2xl bg-sky p-3 text-center text-sm font-bold">Ta position est partagée avec la famille (10 min max).</p>
          )}
          {enCours.lat === null && (
            <Btn
              variant="white"
              className="w-full"
              disabled={!!occupe}
              onClick={() =>
                void agir(`pos-${enCours.id}`, async () => {
                  const p = await positionActuelle();
                  if (p.precision > 60 && !(await confirm(`Précision faible (±${p.precision} m). Enregistrer quand même ? Le mieux est d'être juste devant le portail, dehors.`, { confirmLabel: "Enregistrer" }))) return;
                  await rpc("l_position_maison", { p_jeton: jeton(), p_commande: enCours.id, p_lat: p.lat, p_long: p.long });
                  return `Position de ${enCours.code_affichage} enregistrée (±${p.precision} m). Merci !`;
                })
              }
            >
              <Icon name="pin" size={18} /> {occupe === `pos-${enCours.id}` ? "Localisation…" : "Je suis devant la maison"}
            </Btn>
          )}
          {enCours.foyer_a_verifier && (
            <Btn
              variant="white"
              className="w-full"
              disabled={!!occupe}
              onClick={() =>
                void agir(`conf-${enCours.id}`, async () => {
                  if (!(await confirm(<>Tu es devant <strong>{enCours.code_affichage}</strong> : c&apos;est bien la <strong>{enCours.nom_famille}</strong> qui habite ici ?</>, { confirmLabel: "Oui, c'est bien eux" }))) return;
                  await rpc("l_confirmer_foyer", { p_jeton: jeton(), p_commande: enCours.id });
                  return "Famille confirmée. Merci !";
                })
              }
            >
              <Icon name="shield" size={18} /> Confirmer la famille
            </Btn>
          )}
          <Btn
            variant="azur"
            size="lg"
            className="w-full"
            disabled={!!occupe}
            onClick={() =>
              void agir(enCours.id, async () => {
                if (!(await confirm(<>Commande <strong>{enCours.code_affichage}</strong> livrée ?</>, { confirmLabel: "Oui, livrée" }))) return;
                await rpc("l_avancer", { p_jeton: jeton(), p_commande: enCours.id, p_statut: "LIVREE" });
                return `${enCours.code_affichage} livrée !`;
              })
            }
          >
            <Icon name="check" /> Livré
          </Btn>
        </CarteCommande>
      )}

      {/* File d'attente du jour */}
      <section className="space-y-3">
        <h2 className="title-md">Commandes en file d&apos;attente ({aujourdhui.filter((c) => c !== enCours).length})</h2>
        {aujourdhui.filter((c) => c !== enCours).length === 0 && (
          <p className="rounded-2xl border-brut border-dashed border-ink/40 p-5 text-center font-semibold text-ink/55">Aucune commande pour l&apos;instant.</p>
        )}
        {aujourdhui
          .filter((c) => c !== enCours)
          .map((c) => (
            <CarteCommande key={c.id} c={c} principale={c === prochaine && !enCours}>
              {c === prochaine && !enCours && (
                <Btn size="lg" className="w-full" disabled={!!occupe} onClick={() => void agir(c.id, () => rpc("l_avancer", { p_jeton: jeton(), p_commande: c.id, p_statut: "EN_ROUTE" }))}>
                  <Icon name="truck" /> Je pars livrer
                </Btn>
              )}
              {c.statut === "EN_PAUSE" && <p className="text-center text-sm font-semibold text-pause">Reçue pendant ta pause : elle entre dans ta file dès que tu reprends.</p>}
            </CarteCommande>
          ))}
      </section>

      {programmees.length > 0 && (
        <section className="space-y-3">
          <h2 className="title-md">Programmées ({programmees.length})</h2>
          {programmees.map((c) => (
            <CarteCommande key={c.id} c={c} />
          ))}
        </section>
      )}

      <Btn variant="white" size="lg" className="w-full" onClick={() => setSaisie(true)} disabled={bloquePoints}>
        <Icon name="plus" /> Nouvelle commande - Saisie directe
      </Btn>

      {/* OFFLINE : petit bouton gris tout en bas (V2) */}
      {profil.statut !== "HORS_LIGNE" ? (
        <button onClick={() => void changerStatut("HORS_LIGNE")} className="mx-auto flex items-center gap-2 rounded-full border-[1.5px] border-steel px-4 py-2 text-sm font-bold text-ink/50 hover:bg-steel/30">
          <Icon name="power" size={16} /> OFFLINE
        </button>
      ) : (
        <p className="text-center text-sm font-semibold text-ink/50">Tu es hors ligne. Appuie sur REPRENDRE pour revenir.</p>
      )}

      <ModalSaisie open={saisie} codeCourt={profil.code_court} onClose={() => setSaisie(false)} onFait={(msg) => { setSaisie(false); setInfo(msg); void recharger(); }} />
      <ModalPrix open={vue === "prix"} prix={profil.prix_fcfa} onClose={() => setVue(null)} onFait={() => { setVue(null); setInfo("Prix enregistré. Il s'applique aux prochaines commandes."); void recharger(); }} />
      <Modal open={vue === "stats"} onClose={() => setVue(null)} wide>
        <ModalTitle onClose={() => setVue(null)}>Mes statistiques</ModalTitle>
        {vue === "stats" && <Stats />}
      </Modal>
      {dialog}
    </div>
  );
}

function Chiffre({ v, k }: { v: string; k: string }) {
  return (
    <div className="rounded-2xl border-brut border-ink bg-white p-2.5">
      <p className="font-display text-xl font-bold">{v}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink/55">{k}</p>
    </div>
  );
}

function CarteCommande({ c, principale, children }: { c: CommandeFile; principale?: boolean; children?: React.ReactNode }) {
  return (
    <article className={`space-y-3 rounded-brut border-brut border-ink bg-white p-4 ${principale ? "shadow-hard" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink/55">
          {c.statut === "PROGRAMMEE" ? formatProgrammee(c.programmee_pour) : `N°${c.position}`} · #{c.reference}
        </span>
        <div className="flex gap-1">
          {c.source === "LIVREUR" && <Badge tone="orange">Saisie directe</Badge>}
          <Badge tone={c.statut === "EN_ROUTE" || c.statut === "ARRIVE" ? "green" : c.statut === "EN_ATTENTE" ? "azur" : "gray"}>{STATUT_COMMANDE[c.statut]}</Badge>
        </div>
      </div>
      <div>
        <p className="font-display text-4xl font-bold leading-none">{c.code_affichage}</p>
        <p className="mt-1.5 text-lg font-bold">{c.nom_famille}</p>
        <p className="text-ink/65">
          Commandé par {c.commande_par}
          {c.role_commande ? ` (${roleLabel(c.role_commande)})` : ""} à {dateHeure(c.created_at)} · {fcfa(c.prix_fcfa)}
        </p>
        {c.note && <p className="mt-1 rounded-xl bg-mist px-3 py-2 text-sm font-semibold">« {c.note} »</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {c.telephone_contact ? (
          <LinkBtn href={`tel:${c.telephone_contact}`} variant="white">
            <Icon name="phone" size={18} /> Appeler
          </LinkBtn>
        ) : (
          <span />
        )}
        {c.lat !== null && c.long !== null ? (
          <LinkBtn href={lienItineraire(c.lat, c.long)} target="_blank" rel="noopener noreferrer" variant="white">
            <Icon name="nav" size={18} /> Naviguer
          </LinkBtn>
        ) : (
          <span className="self-center text-center text-xs font-semibold text-ink/45">Position inconnue</span>
        )}
      </div>
      {children}
    </article>
  );
}

// ─── Prix ────────────────────────────────────────────────────────────────────

function ModalPrix({ open, prix, onClose, onFait }: { open: boolean; prix: number; onClose: () => void; onFait: () => void }) {
  const [v, setV] = useState(String(prix));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setV(String(prix));
    setErr(null);
  }, [open, prix]);
  return (
    <Modal open={open} onClose={onClose}>
      <ModalTitle onClose={onClose}>Mon prix</ModalTitle>
      <div className="space-y-4">
        <Field label="Prix pour 1000 L (FCFA)" hint="Entre 100 et 50 000 FCFA. Les commandes déjà passées gardent l'ancien prix.">
          <input className="field font-display !text-2xl font-bold" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 5))} />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn
          size="lg"
          className="w-full"
          onClick={async () => {
            try {
              await rpc("l_prix", { p_jeton: lireJeton(), p_prix: Number(v) });
              onFait();
            } catch (e) {
              setErr(messageErreur(e));
            }
          }}
        >
          Enregistrer
        </Btn>
      </div>
    </Modal>
  );
}

// ─── Statistiques (V2) ───────────────────────────────────────────────────────

type Course = { reference: string; statut: string; source: string; code_affichage: string; nom_famille: string; prix_fcfa: number; created_at: string; livree_at: string | null };

function Stats() {
  const [data, setData] = useState<Course[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    rpc<Course[]>("l_historique", { p_jeton: lireJeton() }).then(setData, (e) => setErr(messageErreur(e)));
  }, []);
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!data) return <Spinner />;
  const livrees = data.filter((c) => c.statut === "LIVREE" && c.livree_at);
  const depuis = (jours: number) => livrees.filter((c) => Date.now() - new Date(c.livree_at!).getTime() < jours * 86400000);
  const bloc = (l: Course[]) => ({ n: l.length, f: l.reduce((a, c) => a + c.prix_fcfa, 0) });
  const p = [
    { k: "7 jours", ...bloc(depuis(7)) },
    { k: "30 jours", ...bloc(depuis(30)) },
    { k: "Total", ...bloc(livrees) },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {p.map((x) => (
          <div key={x.k} className="rounded-2xl border-brut border-ink bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink/55">{x.k}</p>
            <p className="font-display text-2xl font-bold">{x.n}</p>
            <p className="text-xs font-semibold text-ink/60">{fcfa(x.f)}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-ink/10 rounded-2xl border-brut border-ink bg-white text-sm">
        {data.slice(0, 50).map((c) => (
          <li key={c.reference} className="flex justify-between gap-2 px-3 py-2">
            <span>
              <strong>{c.code_affichage}</strong> · {c.nom_famille}
              {c.source === "LIVREUR" ? " · saisie directe" : ""}
            </span>
            <span className="text-right text-ink/60">
              {STATUT_COMMANDE[c.statut]} · {dateHeure(c.livree_at ?? c.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Saisie directe ──────────────────────────────────────────────────────────

type Apercu = { code_affichage: string; statut: string; nom_famille: string | null; commande_en_cours: boolean };

function ModalSaisie({ open, codeCourt, onClose, onFait }: { open: boolean; codeCourt: string; onClose: () => void; onFait: (msg: string) => void }) {
  const [numero, setNumero] = useState("");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [apercuErr, setApercuErr] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumero("");
    setApercu(null);
    setApercuErr(null);
    setNom("");
    setTel("");
    setNote("");
    setErr(null);
  }, [open]);

  // Aperçu de la maison pendant la saisie du numéro.
  useEffect(() => {
    setApercu(null);
    setApercuErr(null);
    if (!numero) return;
    const id = setTimeout(async () => {
      try {
        setApercu(await rpc<Apercu>("l_chercher_maison", { p_jeton: lireJeton(), p_saisie: numero }));
      } catch (e) {
        setApercuErr(messageErreur(e));
      }
    }, 350);
    return () => clearTimeout(id);
  }, [numero]);

  const sansFoyer = apercu && !apercu.nom_famille;

  const valider = async () => {
    setErr(null);
    if (!apercu) return setErr("Tape le numéro de la maison.");
    if (sansFoyer && (nom.trim().length < 2 || !isValidPhone(tel))) return setErr(messageErreur(new ApiError("NOM_TEL_REQUIS")));
    if (tel && !isValidPhone(tel)) return setErr(messageErreur(new ApiError("TELEPHONE_INVALIDE")));
    setEnvoi(true);
    try {
      const r = await rpc<{ reference: string; code_affichage: string }>("l_commande_manuelle", {
        p_jeton: lireJeton(),
        p_maison: numero,
        p_nom: nom || null,
        p_telephone: tel || null,
        p_note: note || null,
      });
      onFait(`Commande ${r.code_affichage} ajoutée à ta file.`);
    } catch (e) {
      setErr(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalTitle onClose={onClose}>Saisie directe</ModalTitle>
      <div className="space-y-4">
        <Field label="Numéro de la maison">
          <div className="flex items-center gap-2">
            <span className="rounded-2xl border-brut border-ink bg-ink px-4 py-3 font-display text-xl font-bold text-white">{codeCourt}</span>
            <input className="field font-display !text-2xl font-bold" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="012" autoFocus />
          </div>
        </Field>
        {apercuErr && <ErrorBox>{apercuErr}</ErrorBox>}
        {apercu && (
          <div className={`rounded-2xl border-brut p-3 font-semibold ${apercu.commande_en_cours || apercu.statut === "BLOQUEE" ? "border-danger text-danger" : "border-ink bg-white"}`}>
            <p className="font-display text-2xl font-bold">{apercu.code_affichage}</p>
            {apercu.statut === "BLOQUEE"
              ? "Maison suspendue : commande impossible."
              : apercu.commande_en_cours
              ? "Une commande est déjà en cours pour cette maison."
              : apercu.nom_famille
              ? `${apercu.nom_famille} (inscrite sur l'appli)`
              : "Pas encore inscrite : nom et numéro du client obligatoires."}
          </div>
        )}
        <Field label={sansFoyer ? "Nom du client" : "Qui appelle ? (facultatif)"}>
          <input className="field" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} placeholder={sansFoyer ? "Mme Diallo" : "Maman"} />
        </Field>
        <Field label={sansFoyer ? "Numéro du client" : "Numéro (facultatif)"}>
          <PhoneInput value={tel} onChange={setTel} required={!!sansFoyer} />
        </Field>
        <Field label="Note (facultatif)">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Portail bleu, 2 bidons…" />
        </Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn size="lg" className="w-full" onClick={() => void valider()} disabled={envoi || !apercu || apercu.commande_en_cours || apercu.statut === "BLOQUEE"}>
          {envoi ? "Ajout…" : "Ajouter à ma file"}
        </Btn>
      </div>
    </Modal>
  );
}
