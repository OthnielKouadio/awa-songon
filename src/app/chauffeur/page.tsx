"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import MapLazy from "@/components/MapLazy";
import { Toast } from "@/components/Toast";
import { Badge, Btn, CloseButton, ErrorBox, LinkBtn, Logo, Modal, PulseDot, Spinner, StatutBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { AppError, errorMessage } from "@/lib/errors";
import {
  callLink,
  formatFcfa,
  formatPoints,
  heure,
  navigationLink,
  NUMERO_RECHARGE,
  onlyDigits,
  PRIX_MAX,
  PRIX_MIN,
  QUANTITE_L,
  SOLDE_MIN,
} from "@/lib/format";
import { clearSession, readSession } from "@/lib/session";
import { playNotification, unlockAudio } from "@/lib/sound";
import type { ChauffeurCommande, ChauffeurProfile, Creds } from "@/lib/types";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

const SOUND_KEY = "awa:sound";

export default function ChauffeurPage() {
  const router = useRouter();
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
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6" onPointerDown={unlockAudio}>
      <header>
        <Logo href="/chauffeur" />
      </header>
      <Dashboard creds={creds} onLogout={logout} />
    </main>
  );
}

function Dashboard({ creds, onLogout }: { creds: Creds; onLogout: () => void }) {
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
  const knownIds = useRef<Set<string> | null>(null);
  const soundRef = useRef(true);
  const prixDirtyRef = useRef(false);

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
    }
  }

  async function partir() {
    setBusy(true);
    setError("");
    try {
      const r = await api.chauffeurPartir(creds);
      await load();
      if (r.bonusFidelite) {
        setBonusToast(true);
        setTimeout(() => setBonusToast(false), 3500);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
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

  if (profile.is_offline) {
    return (
      <div className="mt-10">
        <div className="mb-6 flex items-start justify-between gap-3">
          <h1 className="title-lg">{profile.nom}</h1>
          <button onClick={onLogout} className="rounded-xl border-brut border-ink bg-white px-3 py-2 text-sm font-bold transition-colors hover:bg-sky">
            Quitter
          </button>
        </div>
        <div className="brut p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
            <Icon name="lock" size={28} />
          </span>
          <p className="title-md mt-4">Solde épuisé</p>
          <p className="mt-2 font-medium text-ink/60">
            Rechargez par Wave au <strong>{NUMERO_RECHARGE}</strong> pour continuer. Minimum 1000F (1000 points).
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-danger bg-danger/10 px-4 py-2 font-bold text-danger">
            Solde actuel : {formatPoints(profile.solde_points)}
          </div>
          <LinkBtn href={callLink(NUMERO_RECHARGE)} variant="ink" size="lg" className="mt-6 w-full">
            <Icon name="phone" size={20} /> Appeler pour recharger
          </LinkBtn>
        </div>
      </div>
    );
  }

  const dispo = profile.status === "DISPO";
  const bloque = profile.statut === "BLOQUE";
  const enCours = file.find((c) => c.status === "EN_COURS");
  const premier = file.find((c) => c.status === "EN_ATTENTE");
  const aLaSource = profile.etat === "A_LA_SOURCE";

  return (
    <div className="mt-10 space-y-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label !mb-1">
            {profile.cites.map((c) => c.nom).join(", ")}
            {profile.source_nom ? ` · ${profile.source_nom}` : ""}
          </p>
          <h1 className="title-lg">{profile.nom}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatutBadge statut={profile.statut} />
            <Badge tone={profile.solde_points < SOLDE_MIN * 4 ? "danger" : "sky"}>{formatPoints(profile.solde_points)}</Badge>
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
          <button onClick={onLogout} className="rounded-xl border-brut border-ink bg-white px-3 text-sm font-bold transition-colors hover:bg-sky">
            Quitter
          </button>
        </div>
      </div>

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

      {/* GROS TOGGLE DISPO / OFF */}
      <DispoToggle dispo={dispo} disabled={busy || bloque} onToggle={() => act(() => api.chauffeurSetStatus(creds, dispo ? "OFF" : "DISPO"))} />
      <p className="-mt-3 text-center text-sm font-medium text-ink/55">
        {dispo
          ? "Les clients de ta cité te voient et peuvent commander."
          : "Tu es invisible : plus de nouvelle commande. Ta file actuelle reste à livrer."}
      </p>

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

      {/* ÉTAT */}
      <div className="brut space-y-4 p-4">
        <div className="flex items-center justify-between">
          <span className="label !mb-0">Ton tricycle</span>
          <Badge tone={aLaSource ? "sky" : "azur"}>
            <PulseDot color={aLaSource ? "#0096FF" : "#FFFFFF"} pulse={!aLaSource} />
            {aLaSource ? "À la source" : "En route"}
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Btn variant={aLaSource ? "white" : "azur"} size="lg" disabled={busy || aLaSource} onClick={() => act(() => api.chauffeurSetEtat(creds, "A_LA_SOURCE"))}>
            <Icon name="drop" size={20} /> Je suis à la source
          </Btn>
          <Btn variant="ink" size="lg" disabled={busy || !premier || !!enCours} onClick={() => void partir()}>
            <Icon name="truck" size={20} /> Je pars livrer N°{premier?.position_file ?? 1}
          </Btn>
        </div>
      </div>

      {/* FILE D'ATTENTE */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="title-md">File d&apos;attente</h2>
          <Badge tone="ink">
            {file.length} commande{file.length > 1 ? "s" : ""}
          </Badge>
        </div>

        {file.length === 0 ? (
          <div className="brut-sm p-8 text-center font-semibold text-ink/60">
            <Icon name="drop" size={32} className="mx-auto mb-2 text-azur" />
            Aucune commande pour l&apos;instant.
            {!dispo && <span className="mt-1 block text-sm">Passe DISPO pour en recevoir.</span>}
          </div>
        ) : (
          <ul className="space-y-4">
            <AnimatePresence mode="popLayout">
              {file.map((c) => (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 60 }}
                  transition={{ type: "spring", stiffness: 220, damping: 28 }}
                  className={`brut p-4 ${c.status === "EN_COURS" ? "!border-azur !bg-sky" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-3xl font-bold leading-none">
                        N°{c.position_file} · Lot {c.lot_numero}
                      </p>
                      <p className="mt-2.5 text-lg font-bold">
                        {c.client_nom} · {QUANTITE_L}L
                      </p>
                      <p className="text-sm font-medium text-ink/55">reçue à {heure(c.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {c.status === "EN_COURS" && (
                        <Badge tone="azur">
                          <PulseDot color="#FFFFFF" /> En livraison
                        </Badge>
                      )}
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

      <Toast open={bonusToast}>Bravo ! 1 livraison gratuite offerte (+50 pts)</Toast>
    </div>
  );
}

// ─── Gros toggle DISPO (bleu qui pulse) / OFF (gris) ───────────────────────

function DispoToggle({ dispo, disabled, onToggle }: { dispo: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      {dispo && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-azur"
          animate={{ scale: [1, 1.09], opacity: [0.45, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
        />
      )}
      <motion.button
        type="button"
        role="switch"
        aria-checked={dispo}
        aria-label={dispo ? "Passer OFF" : "Passer DISPO"}
        disabled={disabled}
        onClick={onToggle}
        whileTap={{ scale: 0.98 }}
        animate={{ backgroundColor: dispo ? "#0096FF" : "#C9D5E3" }}
        transition={{ duration: 0.3 }}
        className="relative flex h-28 w-full items-center rounded-full border-brut border-ink p-3 shadow-hard disabled:opacity-70"
      >
        <span className={`flex-1 text-center font-display text-5xl font-bold tracking-tight ${dispo ? "pr-24 text-white" : "pl-24 text-ink/60"}`}>
          {dispo ? "DISPO" : "OFF"}
        </span>
        <motion.span
          className="absolute top-3 grid h-[76px] w-[76px] place-items-center rounded-full border-brut border-ink bg-white"
          animate={{ left: dispo ? "calc(100% - 88px)" : "12px" }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          <Icon name={dispo ? "truck" : "power"} size={32} className={dispo ? "text-azur" : "text-ink/60"} />
        </motion.span>
      </motion.button>
    </div>
  );
}
