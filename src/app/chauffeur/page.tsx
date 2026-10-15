"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/CustomModal";
import { Icon } from "@/components/icons";
import MapLazy from "@/components/MapLazy";
import { Toast } from "@/components/Toast";
import ManualOrderModal from "@/components/ManualOrderModal";
import {
  Badge,
  Btn,
  CiteBadge,
  CloseButton,
  CommandeBadge,
  ErrorBox,
  LinkBtn,
  Logo,
  Modal,
  PulseDot,
  SegmentedFilter,
  SourceBadge,
  Spinner,
  StatutBadge,
} from "@/components/ui";
import { ChangerPinObligatoire, EssaiBadge, FinEssaiBanner, RechargeModal } from "@/components/compte";
import SideMenu from "@/components/SideMenu";
import { StatsChauffeurModal } from "@/components/StatsChauffeur";
import { usePrivateBase } from "@/components/PrivateBase";
import { api } from "@/lib/data-provider";
import { AppError, errorMessage } from "@/lib/errors";
import {
  enEssai,
  FILTRES_SOURCE,
  type FiltreSource,
  formatFcfa,
  formatPoints,
  formatProgrammee,
  heure,
  navigationLink,
  onlyDigits,
  PARTAGE_GPS_MAX_MS,
  PRIX_MAX,
  PRIX_MIN,
  QUANTITE_L,
  RECHARGE_MIN_FCFA,
  SOLDE_MIN,
} from "@/lib/format";
import { callLink, formatPhone } from "@/lib/phone";
import { clearSession, readSession } from "@/lib/session";
import { playNotification, unlockAudio } from "@/lib/sound";
import type { ChauffeurCommande, ChauffeurHistorique, ChauffeurProfile, Creds, TricycleStatus } from "@/lib/types";
import { useDepotPhone } from "@/lib/useDepotPhone";
import { useGeoWatch } from "@/lib/useGeoWatch";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

const SOUND_KEY = "awa:sound";

export default function ChauffeurPage() {
  const router = useRouter();
  const base = usePrivateBase();
  const [creds, setCreds] = useState<Creds | null | undefined>(undefined);

  useEffect(() => {
    const s = readSession();
    if (!s || s.role !== "chauffeur") {
      router.replace("/login");
      return;
    }
    setCreds(s);
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    router.replace("/login");
  }, [router]);

  if (creds === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }
  if (!creds) return null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6" onPointerDown={unlockAudio}>
      <header>
        <Logo href={base} />
      </header>
      <Dashboard creds={creds} onLogout={logout} />
    </main>
  );
}

/** Le partage GPS d'une commande ARRIVING est-il encore dans sa fenêtre de 10 min ? */
const partageActif = (c: ChauffeurCommande | undefined, now: number) =>
  !!c && c.status === "ARRIVING" && !!c.arriving_at && now - new Date(c.arriving_at).getTime() < PARTAGE_GPS_MAX_MS;

function Dashboard({ creds, onLogout }: { creds: Creds; onLogout: () => void }) {
  const depot = useDepotPhone();
  const [profile, setProfile] = useState<ChauffeurProfile | null>(null);
  const [file, setFile] = useState<ChauffeurCommande[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [mapFor, setMapFor] = useState<ChauffeurCommande | null>(null);
  const [prixInput, setPrixInput] = useState("");
  const [prixDirty, setPrixDirty] = useState(false);
  const [prixSaved, setPrixSaved] = useState(false);
  const [bonusToast, setBonusToast] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [manuelOpen, setManuelOpen] = useState(false);
  const [filtre, setFiltre] = useState<FiltreSource>("all");
  const [statsOpen, setStatsOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [historique, setHistorique] = useState<ChauffeurHistorique[] | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const knownIds = useRef<Set<string> | null>(null);
  const soundRef = useRef(true);
  const prixDirtyRef = useRef(false);
  // Les points sont déduits à la CRÉATION de la commande (côté client), pas
  // quand ce chauffeur clique "Je pars livrer" : le bonus fidélité peut donc
  // arriver entre deux chargements, sans action de sa part. On le détecte en
  // comparant total_points_utilises d'un chargement à l'autre (il ne repasse à
  // 0 QUE via ce bonus, jamais via une recharge admin).
  const prevTotalUtilise = useRef<number | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SOUND_KEY) !== "off";
      setSoundOn(v);
      soundRef.current = v;
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api.chauffeurProfil(creds), api.chauffeurFile(creds)]);
      setProfile(p);
      setPrixInput((cur) => (prixDirtyRef.current ? cur : String(p.prix_1000)));
      setFile(f);
      setError("");

      if (prevTotalUtilise.current !== null && prevTotalUtilise.current > 0 && p.total_points_utilises === 0) {
        setBonusToast(true);
        setTimeout(() => setBonusToast(false), 3500);
      }
      prevTotalUtilise.current = p.total_points_utilises;

      if (knownIds.current) {
        const fresh = f.some((c) => !knownIds.current!.has(c.id));
        if (fresh && soundRef.current) playNotification();
      }
      knownIds.current = new Set(f.map((c) => c.id));
    } catch (e) {
      if (e instanceof AppError && (e.code === "AUTH" || e.code === "REFUSE")) onLogout();
      else setError(errorMessage(e));
    }
  }, [creds, onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh([profile ? `tricycle:${profile.id}` : null], load, 8000);

  // Historique chargé à l'ouverture des statistiques seulement (inutile à chaque rafraîchissement de la file).
  useEffect(() => {
    if (!statsOpen) return;
    setHistorique(null);
    api.chauffeurHistorique(creds).then(setHistorique, (e) => {
      setStatsOpen(false);
      setError(errorMessage(e));
    });
  }, [statsOpen, creds]);

  // GPS live : UNIQUEMENT après « J'arrive chez toi », 10 min max. Le hook
  // throttle lui-même (10 s s'il bouge, 30 s s'il avance peu, rien à l'arrêt)
  // et coupe dès que le serveur répond actif: false (livré, fenêtre dépassée).
  const arriving = file.find((c) => c.status === "ARRIVING");
  const gpsOn = partageActif(arriving, now);
  useEffect(() => {
    if (!arriving) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [arriving]);
  useGeoWatch(
    gpsOn,
    arriving?.id ?? null,
    useCallback(
      (lat: number, lng: number) =>
        api
          .chauffeurSetPosition(creds, lat, lng)
          .then((r) => r.actif)
          .catch(() => true), // erreur réseau ponctuelle : on continue d'essayer
      [creds]
    )
  );

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  const setStatus = (s: TricycleStatus) => act(() => api.chauffeurSetStatus(creds, s));

  async function passerOffline() {
    const ok = await confirm(
      "Tu restes visible : les clients pourront toujours commander, mais leurs commandes seront programmées pour demain 8h.\nTa file actuelle reste à livrer.",
      { title: "Sûr de vouloir passer hors ligne ?", confirmLabel: "Passer hors ligne" }
    );
    if (ok) void setStatus("OFFLINE");
  }

  async function savePrix(e: React.FormEvent) {
    e.preventDefault();
    const p = Number(prixInput);
    if (!Number.isFinite(p) || p < PRIX_MIN || p > PRIX_MAX) return setError("Entre un prix valide (de 100 à 50 000 FCFA).");
    await act(() => api.chauffeurSetPrix(creds, p));
    prixDirtyRef.current = false;
    setPrixDirty(false);
    setPrixSaved(true);
    setTimeout(() => setPrixSaved(false), 2500);
  }

  function toggleSound() {
    const v = !soundOn;
    setSoundOn(v);
    soundRef.current = v;
    try {
      localStorage.setItem(SOUND_KEY, v ? "on" : "off");
    } catch {}
    if (v) playNotification();
  }

  if (!profile) return error ? <div className="mt-10"><ErrorBox>{error}</ErrorBox></div> : <Spinner />;

  // Statistiques et recharge : seulement une fois le compte validé et le code définitif choisi.
  const menu = (
    <SideMenu
      titre={profile.nom}
      sousTitre={`${profile.cite_nom}${profile.source_nom ? ` · ${profile.source_nom}` : ""}`}
      items={
        profile.pin_provisoire || !profile.valide
          ? []
          : [
              { icon: "layers", label: "Mes statistiques", hint: "Mes livraisons par mois", onClick: () => setStatsOpen(true) },
              { icon: "money", label: "Recharger mes points", hint: "Par Wave, avant d'être bloqué", onClick: () => setRechargeOpen(true) },
            ]
      }
      onLogout={onLogout}
    />
  );
  const fenetres = (
    <>
      <StatsChauffeurModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        historique={historique}
        essai={enEssai(profile.essai_fin)}
        totalUtilise={profile.total_points_utilises}
      />
      <RechargeModal
        role="chauffeur"
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        depot={depot}
        soldePoints={profile.solde_points}
        essaiFin={profile.essai_fin}
        tel={profile.telephone}
      />
    </>
  );

  const entete = (
    <div className="mb-6 flex items-start justify-between gap-3">
      <h1 className="title-lg">{profile.nom}</h1>
      {menu}
      {fenetres}
    </div>
  );

  // Code provisoire donné par l'admin (code oublié) : nouveau code obligatoire avant tout.
  if (profile.pin_provisoire) {
    return (
      <div className="mt-10">
        {entete}
        <ChangerPinObligatoire
          onSubmit={async (pin) => {
            await api.chauffeurChangerPin(creds, pin);
            await load();
          }}
        />
      </div>
    );
  }

  // Anti-intrusion : invisible des clients tant que l'admin n'a pas validé le compte.
  if (!profile.valide) {
    return (
      <div className="mt-10">
        {entete}
        <div className="brut p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky text-azur">
            <Icon name="clock" size={28} />
          </span>
          <p className="title-md mt-4">Compte en attente de validation</p>
          <p className="mt-2 font-medium text-ink/60">
            Ton inscription est bien reçue. L&apos;administrateur va vérifier ton compte et t&apos;appeler. Tu seras visible des clients dès qu&apos;il
            l&apos;aura validé.
          </p>
          {depot && (
            <LinkBtn href={callLink(depot)} variant="ink" size="lg" className="mt-6 w-full">
              <Icon name="phone" size={20} /> Appeler l&apos;administrateur
            </LinkBtn>
          )}
          <Btn variant="white" className="mt-3 w-full" onClick={() => void load()}>
            Vérifier à nouveau
          </Btn>
        </div>
      </div>
    );
  }

  if (profile.is_offline) {
    return (
      <div className="mt-10">
        {entete}
        <div className="brut p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
            <Icon name="lock" size={28} />
          </span>
          <p className="title-md mt-4">Recharge ton compte pour continuer</p>
          <p className="mt-2 font-medium text-ink/60">
            Rechargez par Wave au <strong>{depot ? formatPhone(depot) : "…"}</strong> pour continuer. Minimum {formatFcfa(RECHARGE_MIN_FCFA)} ({RECHARGE_MIN_FCFA} points).
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-danger bg-danger/10 px-4 py-2 font-bold text-danger">
            Solde actuel : {formatPoints(profile.solde_points)}
          </div>
          {depot && (
            <LinkBtn href={callLink(depot)} variant="ink" size="lg" className="mt-6 w-full">
              <Icon name="phone" size={20} /> Appeler pour recharger
            </LinkBtn>
          )}
          <Btn variant="white" className="mt-3 w-full" onClick={() => setRechargeOpen(true)}>
            <Icon name="money" size={18} /> Détails de la recharge
          </Btn>
        </div>
      </div>
    );
  }

  const bloque = profile.statut === "BLOQUE";
  const visibles = filtre === "all" ? file : file.filter((c) => c.source === filtre);
  const enCours = file.find((c) => c.status === "EN_COURS" || c.status === "ARRIVING");
  const premier = file.find((c) => c.status === "ASSIGNED");
  const aLaSource = profile.etat === "A_LA_SOURCE";

  return (
    <div className="mt-8 space-y-7">
      <FinEssaiBanner fin={profile.essai_fin} depot={depot} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CiteBadge>
            Tu livres à {profile.cite_nom}
            {profile.source_nom ? ` · ${profile.source_nom}` : ""}
          </CiteBadge>
          <h1 className="title-lg mt-2">{profile.nom}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {enEssai(profile.essai_fin) ? (
              <EssaiBadge fin={profile.essai_fin} />
            ) : (
              <>
                <StatutBadge statut={profile.statut} />
                <Badge tone={profile.solde_points < SOLDE_MIN * 4 ? "danger" : "sky"}>{formatPoints(profile.solde_points)}</Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Couper le son" : "Activer le son"}
            className="grid h-11 w-11 place-items-center rounded-xl border-brut border-ink bg-white transition-colors hover:bg-sky"
          >
            <Icon name={soundOn ? "bell" : "bellOff"} size={20} className={soundOn ? "text-azur" : "text-ink/50"} />
          </button>
          {menu}
        </div>
      </div>
      {fenetres}

      {error && <ErrorBox>{error}</ErrorBox>}

      {bloque && (
        <div className="brut p-5">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger">
            <Icon name="lock" size={24} />
          </span>
          <p className="title-md mt-3">Compte bloqué</p>
          <p className="mt-1 font-medium text-ink/60">
            Contacte l&apos;administrateur pour réactiver ton compte. Tu peux terminer les livraisons déjà en cours ci-dessous.
          </p>
        </div>
      )}

      {/* EN HAUT : gros bouton PAUSE (orange) / REPRENDRE (vert) */}
      {!bloque && <PauseButton status={profile.status} disabled={busy} onChange={setStatus} />}

      {!bloque && (
        <Btn variant="ink" size="lg" className="w-full" disabled={busy} onClick={() => setManuelOpen(true)}>
          <Icon name="plus" size={20} /> Nouvelle commande - Saisie directe
        </Btn>
      )}

      {/* CENTRE : file d'attente */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="title-md">Commandes en file d&apos;attente ({file.length})</h2>
          <SegmentedFilter
            ariaLabel="Filtrer par origine"
            value={filtre}
            onChange={setFiltre}
            options={FILTRES_SOURCE.map((f) => ({ ...f, count: f.id === "all" ? file.length : file.filter((c) => c.source === f.id).length }))}
          />
        </div>

        <div className="brut mb-5 grid gap-3 p-4 sm:grid-cols-2">
          <Btn variant={aLaSource ? "white" : "azur"} disabled={busy || aLaSource} onClick={() => act(() => api.chauffeurSetEtat(creds, "A_LA_SOURCE"))}>
            <Icon name="drop" size={18} /> Je suis à la source
          </Btn>
          <Btn variant="ink" disabled={busy || !premier || !!enCours} onClick={() => act(() => api.chauffeurPartir(creds).then(() => {}))}>
            <Icon name="truck" size={18} /> Je pars livrer {premier ? `N°${premier.position_file}` : ""}
          </Btn>
        </div>

        {visibles.length === 0 ? (
          <div className="brut-sm p-8 text-center font-semibold text-ink/60">
            <Icon name="drop" size={32} className="mx-auto mb-2 text-azur" />
            {file.length === 0 ? "Aucune commande pour l'instant." : "Aucune commande pour ce filtre."}
          </div>
        ) : (
          <ul className="space-y-4">
            <AnimatePresence mode="popLayout">
              {visibles.map((c) => (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 60 }}
                  transition={{ type: "spring", stiffness: 220, damping: 28 }}
                  className={`brut p-4 ${c.status === "EN_COURS" || c.status === "ARRIVING" ? "!border-azur !bg-sky" : ""} ${
                    c.status === "QUEUED" || c.status === "PROGRAMMED" ? "opacity-80" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-3xl font-bold leading-none">
                        N°{c.position_file} · Lot {c.lot_numero}
                      </p>
                      <p className="mt-2.5 text-lg font-bold">
                        {c.client_nom} · {c.quantite_bidons ? `${c.quantite_bidons} bidon${c.quantite_bidons > 1 ? "s" : ""}` : `${QUANTITE_L}L`}
                      </p>
                      {c.source === "manual" && (
                        <p className="text-sm font-medium text-ink/55">
                          Ajouté par {c.added_by_nom ?? "un chauffeur"} à {heure(c.created_at)}
                          {c.is_temporary_client && " · client sans compte"}
                        </p>
                      )}
                      <p className="text-sm font-medium text-ink/55">
                        {c.source === "app" && `reçue à ${heure(c.created_at)}`}
                        {c.status === "QUEUED" && " · à livrer aujourd'hui"}
                        {c.status === "PROGRAMMED" && ` · programmée ${formatProgrammee(c.programmee_pour)}`}
                      </p>
                      {c.note && <p className="mt-1 text-sm text-ink/70">Note : {c.note}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <SourceBadge source={c.source} />
                      <CommandeBadge status={c.status} />
                      {c.lat != null ? (
                        <Badge tone="sky">
                          <Icon name="pin" size={12} /> GPS précis
                        </Badge>
                      ) : (
                        <Badge tone="gray">Lot seul</Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <LinkBtn href={callLink(c.client_tel)} variant="white" className="col-span-2">
                      <Icon name="phone" size={18} className="text-azur" /> Appeler {c.client_nom} {c.client_tel}
                    </LinkBtn>
                    {c.lat != null && c.long != null ? (
                      <>
                        <LinkBtn href={navigationLink(c.lat, c.long)} target="_blank" rel="noopener noreferrer" variant="azur">
                          <Icon name="nav" size={18} /> Naviguer
                        </LinkBtn>
                        <Btn variant="white" onClick={() => setMapFor(c)}>
                          <Icon name="map" size={18} className="text-azur" /> Voir sur carte
                        </Btn>
                      </>
                    ) : null}
                  </div>

                  {c.status === "EN_COURS" && (
                    <Btn variant="azur" size="lg" className="mt-3 w-full" disabled={busy} onClick={() => act(() => api.chauffeurArriver(creds, c.id))}>
                      <Icon name="pin" size={20} /> J&apos;ARRIVE CHEZ TOI
                    </Btn>
                  )}
                  {c.status === "ARRIVING" && (
                    <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-azur bg-white px-3 py-2 text-sm font-bold text-azur">
                      {partageActif(c, now) ? (
                        <>
                          <PulseDot /> Position partagée avec {c.client_nom} · coupure auto dans{" "}
                          {Math.max(1, Math.ceil((PARTAGE_GPS_MAX_MS - (now - new Date(c.arriving_at!).getTime())) / 60000))} min
                        </>
                      ) : (
                        "Partage de position terminé (10 min)"
                      )}
                    </p>
                  )}
                  {(c.status === "EN_COURS" || c.status === "ARRIVING") && (
                    <Btn variant="ink" size="lg" className="mt-3 w-full" disabled={busy} onClick={() => act(() => api.chauffeurLivrer(creds, c.id))}>
                      <Icon name="check" size={20} /> Livré
                    </Btn>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {/* PRIX POUR 1000L */}
      <form onSubmit={savePrix} className="brut p-4">
        <label className="label" htmlFor="prix-1000">
          Ton prix pour {QUANTITE_L}L (FCFA)
        </label>
        <div className="flex gap-3">
          <input
            id="prix-1000"
            className="field !py-2.5 font-bold"
            inputMode="numeric"
            pattern="[0-9]*"
            value={prixInput}
            onChange={(e) => {
              prixDirtyRef.current = true;
              setPrixDirty(true);
              setPrixSaved(false);
              setPrixInput(onlyDigits(e.target.value, 5));
            }}
          />
          <Btn type="submit" variant="ink" disabled={busy || !prixDirty || !prixInput}>
            {prixSaved ? (
              <>
                <Icon name="check" size={18} /> Enregistré
              </>
            ) : (
              "Enregistrer"
            )}
          </Btn>
        </div>
        <p className="mt-2 text-sm font-medium text-ink/55">
          Les clients voient : {QUANTITE_L}L à {formatFcfa(Number(prixInput) || profile.prix_1000)}
        </p>
      </form>

      {/* TOUT EN BAS : OFFLINE, discret */}
      {!bloque && profile.status !== "OFFLINE" && (
        <div className="pt-6 text-center">
          <button
            onClick={passerOffline}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border-[1.5px] border-steel bg-white px-3 py-1.5 text-xs font-bold text-ink/50 transition-colors hover:border-ink/40 hover:text-ink/70 disabled:opacity-40"
          >
            <Icon name="power" size={13} /> OFFLINE
          </button>
        </div>
      )}

      <Modal open={!!mapFor} onClose={() => setMapFor(null)} wide>
        {mapFor && mapFor.lat != null && mapFor.long != null && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="title-md">Lot {mapFor.lot_numero}</h3>
              <CloseButton onClick={() => setMapFor(null)} />
            </div>
            <MapLazy
              height="55dvh"
              markers={[{ id: mapFor.id, lat: mapFor.lat, lng: mapFor.long, kind: "client", title: `Lot ${mapFor.lot_numero}`, lines: [`${QUANTITE_L}L`, mapFor.client_nom] }]}
            />
            <LinkBtn href={navigationLink(mapFor.lat, mapFor.long)} target="_blank" rel="noopener noreferrer" variant="azur" size="lg" className="w-full">
              <Icon name="nav" size={20} /> Naviguer
            </LinkBtn>
          </div>
        )}
      </Modal>

      <ManualOrderModal
        open={manuelOpen}
        creds={creds}
        citeNom={profile.cite_nom}
        prix={profile.prix_1000}
        onClose={() => setManuelOpen(false)}
        onCreated={() => {
          setManuelOpen(false);
          void load();
        }}
      />
      {ConfirmDialog}
      <Toast open={bonusToast}>Bravo ! 1 livraison gratuite offerte (+50 pts)</Toast>
    </div>
  );
}

// ─── Gros bouton PAUSE (orange) / REPRENDRE (vert) ─────────────────────────

const STATUS_TEXTE: Record<TricycleStatus, string> = {
  ACTIVE: "Tu es actif : les nouvelles commandes arrivent directement dans ta file.",
  PAUSED: "En pause : les nouvelles commandes attendent (livrées aujourd'hui). Elles te seront toutes assignées quand tu reprends.",
  OFFLINE: "Hors ligne : tu restes visible, les nouvelles commandes sont programmées pour demain 8h.",
};

function PauseButton({ status, disabled, onChange }: { status: TricycleStatus; disabled: boolean; onChange: (s: TricycleStatus) => void }) {
  const actif = status === "ACTIVE";
  return (
    <div>
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => onChange(actif ? "PAUSED" : "ACTIVE")}
        whileTap={{ x: 3, y: 3, boxShadow: "0px 0px 0px #0A1931" }}
        animate={{ backgroundColor: actif ? "#F28C28" : "#1FA35B" }}
        transition={{ duration: 0.25 }}
        className="flex h-24 w-full items-center justify-center gap-4 rounded-full border-brut border-ink font-display text-4xl font-bold tracking-tight text-white shadow-hard disabled:opacity-60 sm:text-5xl"
      >
        <Icon name={actif ? "pause" : "play"} size={40} fill />
        {actif ? "PAUSE" : "REPRENDRE"}
      </motion.button>
      <p className="mt-3 text-center text-sm font-medium text-ink/55">{STATUS_TEXTE[status]}</p>
    </div>
  );
}
