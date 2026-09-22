"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GeoPrompt from "@/components/GeoPrompt";
import { Icon } from "@/components/icons";
import OrderModal from "@/components/OrderModal";
import OrderTracker from "@/components/OrderTracker";
import TricycleCard from "@/components/TricycleCard";
import { Badge, Btn, ErrorBox, Logo, Spinner, StatutBadge, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { AppError, errorMessage } from "@/lib/errors";
import { daysLeft } from "@/lib/format";
import { clearSession, readSession } from "@/lib/session";
import type { ClientProfile, Creds, Suivi, TricycleDispo } from "@/lib/types";
import { useGeo } from "@/lib/useGeo";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

export default function ClientPage() {
  const router = useRouter();
  const [creds, setCreds] = useState<Creds | null | undefined>(undefined); // undefined = pas encore vérifié

  useEffect(() => {
    const s = readSession();
    if (!s || s.role !== "client") {
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
  if (!creds) return null; // redirection en cours

  return <Dashboard creds={creds} onLogout={logout} />;
}

/** Mémorise la dernière commande suivie : sans ça, dès qu'elle passe LIVRE elle
 *  sort de clientCommandeActive() et l'écran « Livré ! » ne s'afficherait jamais
 *  (retour direct à la liste des tricycles). On garde son id pour pouvoir encore
 *  la récupérer par fetchSuivi() juste après la livraison, puis l'effacer quand
 *  le client passe à autre chose. */
const lastKey = (tel: string) => `awa:lastorder:${tel}`;

function Dashboard({ creds, onLogout }: { creds: Creds; onLogout: () => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [active, setActive] = useState<Suivi | null | undefined>(undefined);
  const [tricycles, setTricycles] = useState<TricycleDispo[] | null>(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<TricycleDispo | null>(null);
  const geo = useGeo();

  const load = useCallback(async () => {
    try {
      const p = await api.clientProfil(creds);
      // Abonnement expiré : on sort avant même de charger la file ou l'historique.
      if (daysLeft(p.subscription_ends_at) <= 0) {
        router.replace("/bloque");
        return;
      }
      setProfile(p);

      let a = await api.clientCommandeActive(creds);
      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem(lastKey(creds.tel));
      } catch {}

      if (a) {
        try {
          localStorage.setItem(lastKey(creds.tel), a.id);
        } catch {}
      } else if (lastId) {
        // vient peut-être d'être livrée : on l'affiche une dernière fois avant de l'oublier
        const finished = await api.fetchSuivi(lastId);
        if (finished && finished.status === "LIVRE") a = finished;
        else {
          try {
            localStorage.removeItem(lastKey(creds.tel));
          } catch {}
        }
      }

      setActive(a);
      if (!a) setTricycles(await api.fetchTricyclesDispo(p.cite_id));
      setError("");
    } catch (e) {
      if (e instanceof AppError && (e.code === "AUTH" || e.code === "REFUSE")) onLogout();
      else setError(errorMessage(e));
    }
  }, [creds, onLogout, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh([profile ? `client:${profile.id}` : null, profile ? `cite:${profile.cite_id}` : null], load, 10000);

  if (!profile) return error ? <Wrap onLogout={onLogout}><ErrorBox>{error}</ErrorBox></Wrap> : <Wrap onLogout={onLogout}><Spinner /></Wrap>;

  const bloque = profile.statut === "BLOQUE";
  const livree = active?.status === "LIVRE";

  function nouvelleCommande() {
    try {
      localStorage.removeItem(lastKey(creds.tel));
    } catch {}
    setActive(null);
    void load();
  }

  return (
    <Wrap onLogout={onLogout} profile={profile}>
      {error && (
        <div className="mb-6">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      {active ? (
        <div className="space-y-5">
          <OrderTracker s={active} start={active.position_file} />
          {livree && (
            <Btn variant="ink" size="lg" className="w-full" onClick={nouvelleCommande}>
              Commander à nouveau
            </Btn>
          )}
        </div>
      ) : bloque ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="brut p-6">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
            <Icon name="lock" size={28} />
          </span>
          <p className="title-md mt-4">Compte bloqué</p>
          <p className="mt-2 font-medium text-ink/60">Contacte l&apos;administrateur pour réactiver ton compte et pouvoir commander.</p>
        </motion.div>
      ) : (
        <>
          <section className="mb-8">
            <Toggle
              on={geo.status === "granted" || geo.status === "asking"}
              onToggle={() => ((geo.status === "granted" || geo.status === "asking") ? geo.disable() : geo.request())}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="pin" size={16} className="text-azur" /> Actualiser ma position pour cette commande
                </span>
              }
              hint={
                geo.status === "asking"
                  ? "Localisation en cours…"
                  : geo.status === "granted" && geo.coords
                  ? `GPS précis · ±${geo.coords.accuracy} m`
                  : "Facultatif : sinon on garde ta position enregistrée."
              }
            />
          </section>

          <section>
            <h2 className="title-md mb-5">Tricycles disponibles · {profile.cite_nom}</h2>
            {tricycles === null ? (
              <Spinner label="Recherche des tricycles" />
            ) : tricycles.length === 0 ? (
              <div className="brut p-6">
                <p className="title-md">Aucun tricycle dispo</p>
                <p className="mt-2 font-medium text-ink/60">
                  Les chauffeurs de {profile.cite_nom} sont en pause. Cette page se met à jour toute seule dès qu&apos;un tricycle repasse DISPO.
                </p>
              </div>
            ) : (
              <ul className="space-y-5">
                <AnimatePresence mode="popLayout">
                  {tricycles.map((t, i) => (
                    <TricycleCard key={t.id} t={t} index={i} onChoose={setChosen} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <OrderModal
            tricycle={chosen}
            creds={creds}
            coords={geo.coords}
            onClose={() => setChosen(null)}
            onOrdered={(id) => {
              setChosen(null);
              try {
                localStorage.setItem(lastKey(creds.tel), id);
              } catch {}
              void load();
            }}
          />
          <GeoPrompt open={geo.shouldPrompt} onAccept={geo.request} onDismiss={geo.dismissPrompt} />
        </>
      )}
    </Wrap>
  );
}

/** "Il te reste X jours" — vert au-delà de 3 jours, orange à partir de 3 jours
 *  ou moins (le compte n'est bloqué et redirigé vers /bloque qu'à 0 jour). */
function SubscriptionBadge({ subscriptionEndsAt }: { subscriptionEndsAt: string }) {
  const days = daysLeft(subscriptionEndsAt);
  const low = days <= 3;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        low ? "border-orange-500 bg-orange-50 text-orange-600" : "border-green-600 bg-green-50 text-green-700"
      }`}
    >
      Il te reste {days} jour{days > 1 ? "s" : ""}
    </span>
  );
}

function Wrap({
  onLogout,
  profile,
  children,
}: {
  onLogout: () => void;
  profile?: ClientProfile;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Logo href="/" />
        <button onClick={onLogout} className="rounded-xl border-brut border-ink bg-white px-3 py-2 text-sm font-bold transition-colors hover:bg-sky">
          <Icon name="logout" size={16} className="inline -mt-0.5 mr-1" /> Quitter
        </button>
      </header>

      {profile && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge tone="sky">
            {profile.cite_nom} · Lot {profile.lot_numero}
          </Badge>
          <StatutBadge statut={profile.statut} />
          <SubscriptionBadge subscriptionEndsAt={profile.subscription_ends_at} />
        </div>
      )}

      <div className="mt-6">{children}</div>
    </main>
  );
}
