"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import GeoPrompt from "@/components/GeoPrompt";
import { Icon, type IconName } from "@/components/icons";
import { Badge, Btn, ErrorBox, Field, Logo, PinInput, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { byNom, normalizePhone, onlyDigits, PRIX_DEFAUT, PRIX_MAX, PRIX_MIN, QUANTITE_L } from "@/lib/format";
import { saveSession } from "@/lib/session";
import type { Cite, Role, Source } from "@/lib/types";
import { useGeo } from "@/lib/useGeo";

type Choix = "client" | "chauffeur";

const HOME: Record<Role, string> = { client: "/", chauffeur: "/chauffeur", admin: "/admin" };

const CARDS: { role: Choix; icon: IconName; title: string; text: string }[] = [
  { role: "client", icon: "home", title: "Je suis client", text: "Commande de l'eau pour ton lot." },
  { role: "chauffeur", icon: "truck", title: "Je suis chauffeur", text: "Gère ta file et tes livraisons." },
];

export default function LoginPage() {
  const router = useRouter();
  const [choix, setChoix] = useState<Choix | null>(null);
  const [checking, setChecking] = useState(true);

  // Déjà connecté (n'importe quel rôle, admin compris) → direct sur son tableau de bord.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem("awa:session:v4");
    } catch {}
    if (raw) {
      try {
        const c = JSON.parse(raw) as { role?: Role };
        if (c.role) {
          router.replace(HOME[c.role]);
          return;
        }
      } catch {}
    }
    setChecking(false);
  }, [router]);

  function onSession(role: Role) {
    router.push(HOME[role]);
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8 flex justify-center">
        <Logo href="/login" />
      </header>

      <AnimatePresence mode="wait">
        {!choix ? (
          <motion.div key="choix" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center">
              <Badge tone="sky">Songon</Badge>
              <h1 className="title-xl mt-4 !text-4xl sm:!text-5xl">Tu es qui ?</h1>
            </div>
            <div className="mt-8 space-y-4">
              {CARDS.map((c, i) => (
                <motion.button
                  key={c.role}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 220, damping: 24 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setChoix(c.role)}
                  className="brut flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-sky"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-azur text-white">
                    <Icon name={c.icon} size={28} />
                  </span>
                  <span>
                    <span className="block font-display text-xl font-bold uppercase tracking-tight">{c.title}</span>
                    <span className="mt-0.5 block text-sm font-medium text-ink/60">{c.text}</span>
                  </span>
                  <Icon name="arrow" size={22} className="ml-auto shrink-0 text-azur" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <button onClick={() => setChoix(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-azur">
              <Icon name="arrow" size={16} className="rotate-180" /> Retour
            </button>
            {choix === "client" ? <ClientAuth onSession={onSession} /> : <ChauffeurAuth onSession={onSession} />}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ─── Onglets Connexion / Inscription ───────────────────────────────────────

function AuthTabs({ mode, onChange }: { mode: "login" | "signup"; onChange: (m: "login" | "signup") => void }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border-brut border-ink bg-white p-1" role="tablist">
      {(
        [
          ["login", "Connexion"],
          ["signup", "Inscription"],
        ] as const
      ).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={mode === id} onClick={() => onChange(id)} className="relative rounded-xl py-2.5 font-bold transition-colors">
          {mode === id && <motion.span layoutId="login-tab" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
          <span className={`relative ${mode === id ? "text-white" : "text-ink/60"}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Champ secret de connexion : un client/chauffeur tape 4 chiffres, l'admin son
 *  mot de passe — le même formulaire sert aux 3, donc pas de contrainte de format. */
function SecretLoginField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Ton code">
      <input
        className="field"
        type="password"
        autoComplete="current-password"
        placeholder="••••"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </Field>
  );
}

// ─── Client ─────────────────────────────────────────────────────────────────

function ClientAuth({ onSession }: { onSession: (role: Role) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [tel, setTel] = useState("");
  const [secret, setSecret] = useState("");
  const [nom, setNom] = useState("");
  const [citeId, setCiteId] = useState("");
  const [lot, setLot] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [cites, setCites] = useState<Cite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const geo = useGeo();
  const signup = mode === "signup";

  useEffect(() => {
    api
      .fetchCites()
      .then((c) => setCites([...c].sort(byNom)))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setError("");
    setPin("");
    setPin2("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (signup) {
      if (pin.length !== 4) return setError("Ton code doit faire 4 chiffres.");
      if (pin !== pin2) return setError("Les deux codes ne sont pas identiques.");
      if (!citeId) return setError("Choisis ta cité.");
      if (!lot.trim()) return setError("Entre ton numéro de lot.");
    }
    setBusy(true);
    try {
      if (signup) {
        const s = await api.inscrireClient({
          nom,
          tel: normalizePhone(tel),
          citeId,
          lot,
          pin,
          gps: geo.coords ? { lat: geo.coords.lat, long: geo.coords.lng } : null,
        });
        saveSession(s.creds);
        onSession("client");
      } else {
        const r = await api.login("client", normalizePhone(tel), secret);
        saveSession(r.session.creds);
        onSession(r.role); // un identifiant admin saisi ici redirige quand même vers /admin
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <Badge tone="sky">Espace client</Badge>
      <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">{signup ? "Crée ton compte" : "Content de te revoir"}</h1>
      <AuthTabs mode={mode} onChange={switchMode} />

      <form onSubmit={submit} className="brut space-y-5 p-5">
        <AnimatePresence initial={false}>
          {signup && (
            <motion.div key="nom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-m-1 overflow-hidden p-1">
              <Field label="Ton nom">
                <input className="field" placeholder="Fatou" autoComplete="name" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        <Field label="Ton numéro de téléphone">
          <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={tel} onChange={(e) => setTel(e.target.value)} required />
        </Field>

        <AnimatePresence initial={false}>
          {signup && (
            <motion.div key="cite-lot" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-m-1 space-y-5 overflow-hidden p-1">
              <Field label="Ta cité">
                <select className="field" value={citeId} onChange={(e) => setCiteId(e.target.value)} required>
                  <option value="">— Choisir ma cité —</option>
                  {cites.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ton numéro de lot">
                <input className="field" placeholder="Ex : 45" maxLength={20} value={lot} onChange={(e) => setLot(e.target.value)} required />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        {signup ? (
          <>
            <Field label="Crée ton code PIN (4 chiffres)" hint="Retiens-le : c'est lui qui protège ton compte.">
              <PinInput value={pin} onChange={setPin} autoComplete="new-password" />
            </Field>
            <Field label="Confirme ton code">
              <PinInput value={pin2} onChange={setPin2} autoComplete="new-password" />
            </Field>
          </>
        ) : (
          <SecretLoginField value={secret} onChange={setSecret} />
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !tel.trim() || (signup ? pin.length !== 4 : !secret)}>
          {busy ? "Un instant…" : signup ? "Créer mon compte" : "Entrer"} {!busy && <Icon name="arrow" size={20} />}
        </Btn>
      </form>

      {signup && (
        <GeoPrompt open={geo.shouldPrompt} onAccept={geo.request} onDismiss={geo.dismissPrompt} />
      )}
    </div>
  );
}

// ─── Chauffeur ──────────────────────────────────────────────────────────────

function ChauffeurAuth({ onSession }: { onSession: (role: Role) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [tel, setTel] = useState("");
  const [secret, setSecret] = useState("");
  const [nom, setNom] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [prix, setPrix] = useState(String(PRIX_DEFAUT));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [cites, setCites] = useState<Cite[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";

  useEffect(() => {
    Promise.all([api.fetchCites(), api.fetchSources()])
      .then(([c, s]) => {
        setCites([...c].sort(byNom));
        setSources([...s].sort(byNom));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setError("");
    setPin("");
    setPin2("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (signup) {
      if (pin.length !== 4) return setError("Ton code doit faire 4 chiffres.");
      if (pin !== pin2) return setError("Les deux codes ne sont pas identiques.");
      if (!sourceId) return setError("Choisis ta source.");
      const p = Number(prix);
      if (!Number.isFinite(p) || p < PRIX_MIN || p > PRIX_MAX) return setError("Entre un prix valide (de 100 à 50 000 FCFA).");
    }
    setBusy(true);
    try {
      if (signup) {
        const s = await api.inscrireChauffeur({ nom, tel: normalizePhone(tel), sourceId, pin, prix: Number(prix) });
        saveSession(s.creds);
        onSession("chauffeur");
      } else {
        const r = await api.login("chauffeur", normalizePhone(tel), secret);
        saveSession(r.session.creds);
        onSession(r.role); // un identifiant admin saisi ici redirige quand même vers /admin
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <Badge tone="sky">Espace chauffeur</Badge>
      <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">{signup ? "Crée ton compte" : "Content de te revoir"}</h1>
      <AuthTabs mode={mode} onChange={switchMode} />

      <form onSubmit={submit} className="brut space-y-5 p-5">
        <AnimatePresence initial={false}>
          {signup && (
            <motion.div key="nom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-m-1 overflow-hidden p-1">
              <Field label="Ton nom">
                <input className="field" placeholder="Kader" autoComplete="name" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        <Field label="Ton numéro de téléphone">
          <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={tel} onChange={(e) => setTel(e.target.value)} required />
        </Field>

        <AnimatePresence initial={false}>
          {signup && (
            <motion.div key="source-prix" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-m-1 space-y-5 overflow-hidden p-1">
              <Field label="Ta source" hint="Le forage où tu remplis ton tricycle.">
                <select className="field" value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
                  <option value="">— Choisir ma source —</option>
                  {cites.map((c) => (
                    <optgroup key={c.id} label={c.nom}>
                      {sources
                        .filter((s) => s.cite_id === c.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nom}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label={`Ton prix pour ${QUANTITE_L}L (FCFA)`} hint="C'est le prix que les clients verront. Tu pourras le changer plus tard.">
                <input className="field" inputMode="numeric" pattern="[0-9]*" placeholder="2500" value={prix} onChange={(e) => setPrix(onlyDigits(e.target.value, 5))} required />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        {signup ? (
          <>
            <Field label="Crée ton code PIN (4 chiffres)" hint="Retiens-le : c'est lui qui protège ton compte.">
              <PinInput value={pin} onChange={setPin} autoComplete="new-password" />
            </Field>
            <Field label="Confirme ton code">
              <PinInput value={pin2} onChange={setPin2} autoComplete="new-password" />
            </Field>
          </>
        ) : (
          <SecretLoginField value={secret} onChange={setSecret} />
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !tel.trim() || (signup ? pin.length !== 4 : !secret)}>
          {busy ? "Un instant…" : signup ? "Créer mon compte" : "Entrer"} {!busy && <Icon name="arrow" size={20} />}
        </Btn>
      </form>
    </div>
  );
}
