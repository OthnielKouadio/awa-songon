"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import SideMenu, { type SideMenuItem } from "@/components/SideMenu";
import { ConsoMoisModal, HistoriqueModal } from "@/components/Consommation";
import GeoPrompt from "@/components/GeoPrompt";
import { ChangerPinObligatoire, EssaiBadge, FinEssaiBanner, RechargeModal } from "@/components/compte";
import { Icon } from "@/components/icons";
import OrderModal from "@/components/OrderModal";
import OrderTracker from "@/components/OrderTracker";
import TricycleCard from "@/components/TricycleCard";
import { useConfirm } from "@/components/CustomModal";
import { Badge, Btn, CiteBadge, ErrorBox, Logo, Spinner, StatutBadge, Toggle } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { AppError, errorMessage } from "@/lib/errors";
import { enEssai, formatPoints, RECHARGE_MULTIPLE_CLIENT, SOLDE_MIN_CLIENT } from "@/lib/format";
import { clearSession, readSession } from "@/lib/session";
import type { ClientHistorique, ClientProfile, Creds, Suivi, TricycleDispo } from "@/lib/types";
import { useDepotPhone } from "@/lib/useDepotPhone";
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
  const [historique, setHistorique] = useState<ClientHistorique[] | null>(null);
  const [histoOpen, setHistoOpen] = useState(false);
  const [consoOpen, setConsoOpen] = useState(false);
  const geo = useGeo();
  const { confirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      const p = await api.clientProfil(creds);
      // Essai terminé et solde insuffisant : on sort avant même de charger la file
      // ou l'historique. Pendant l'essai gratuit, les points sont illimités.
      if (!enEssai(p.essai_fin) && p.solde_points < SOLDE_MIN_CLIENT) {
        router.replace("/bloque");
        return;
      }
      setProfile(p);
      // En parallèle : un échec ici ne doit pas empêcher de commander.
      void api.clientHistorique(creds).then(setHistorique, () => setHistorique((h) => h ?? []));

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
        if (finished && finished.status === "LIVREE") a = finished;
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

  // client:<id> suffit pour suivre sa commande (chaque changement de commande le
  // ping) ; la position live arrive à part, directement dans OrderTracker.
  useLiveRefresh([profile ? `client:${profile.id}` : null, profile ? `cite:${profile.cite_id}` : null], load, 10000);

  if (!profile) return error ? <Wrap onLogout={onLogout}><ErrorBox>{error}</ErrorBox></Wrap> : <Wrap onLogout={onLogout}><Spinner /></Wrap>;

  // Code provisoire donné par l'admin (code oublié) : nouveau code obligatoire avant tout.
  if (profile.pin_provisoire) {
    return (
      <Wrap onLogout={onLogout}>
        <ChangerPinObligatoire
          onSubmit={async (pin) => {
            await api.clientChangerPin(creds, pin);
            await load();
          }}
        />
      </Wrap>
    );
  }

  const bloque = profile.statut === "BLOQUE";
  const livree = active?.status === "LIVREE";

  function nouvelleCommande() {
    try {
      localStorage.removeItem(lastKey(creds.tel));
    } catch {}
    setActive(null);
    void load();
  }

  async function annuler() {
    if (!active) return;
    const ok = await confirm(enEssai(profile?.essai_fin) ? "Tu pourras en repasser une autre ensuite." : "Tes 100 points te seront rendus.", {
      title: "Annuler ta commande ?",
      danger: true,
      confirmLabel: "Oui, annuler",
      cancelLabel: "Non",
    });
    if (!ok) return;
    try {
      await api.clientAnnulerCommande(creds, active.id);
      try {
        localStorage.removeItem(lastKey(creds.tel));
      } catch {}
      setActive(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const essai = enEssai(profile.essai_fin);
  const geoActif = geo.status === "granted" || geo.status === "asking";
  // Le réglage GPS ne sert qu'au moment de commander.
  const peutCommander = !active && !bloque;

  return (
    <Wrap
      onLogout={onLogout}
      profile={profile}
      menuItems={[
        { icon: "drop", label: "Ma conso du mois", hint: "Citernes, coût, simulation", onClick: () => setConsoOpen(true) },
        { icon: "clock", label: "Historique", hint: "Ma consommation d'eau par mois", onClick: () => setHistoOpen(true) },
      ]}
      menuExtra={
        peutCommander && (
          <Toggle
            on={geoActif}
            onToggle={() => (geoActif ? geo.disable() : geo.request())}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" size={16} className="text-azur" /> Position exacte pour ma commande
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
        )
      }
    >
      <ConsoMoisModal
        open={consoOpen}
        onClose={() => setConsoOpen(false)}
        historique={historique}
        essai={essai}
        onHistorique={() => {
          setConsoOpen(false);
          setHistoOpen(true);
        }}
      />
      <HistoriqueModal open={histoOpen} onClose={() => setHistoOpen(false)} historique={historique} essai={essai} />
      {error && (
        <div className="mb-6">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      {active ? (
        <div className="space-y-5">
          <OrderTracker s={active} start={active.position_file} onCancel={annuler} />
          {livree && (
            <Btn variant="ink" size="lg" className="w-full" onClick={nouvelleCommande}>
              Commander à nouveau
            </Btn>
          )}
          {ConfirmDialog}
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
          <section>
            <h2 className="title-md mb-5">Tricycles de {profile.cite_nom}</h2>
            {tricycles === null ? (
              <Spinner label="Recherche des tricycles" />
            ) : tricycles.length === 0 ? (
              <div className="brut p-6">
                <p className="title-md">Aucun tricycle disponible</p>
                <p className="mt-2 font-medium text-ink/60">
                  Aucun chauffeur ne livre {profile.cite_nom} pour l&apos;instant. Cette page se met à jour toute seule dès qu&apos;un tricycle arrive.
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

/** Solde de points du client — rouge sous le seuil de blocage (le compte n'est
 *  bloqué et redirigé vers /bloque qu'en dessous de SOLDE_MIN_CLIENT). */
function PointsBadge({ soldePoints }: { soldePoints: number }) {
  return <Badge tone={soldePoints < SOLDE_MIN_CLIENT * 3 ? "danger" : "sky"}>{formatPoints(soldePoints)}</Badge>;
}

function Wrap({
  onLogout,
  profile,
  menuItems,
  menuExtra,
  children,
}: {
  onLogout: () => void;
  profile?: ClientProfile;
  /** Entrées du menu propres à l'écran ; sans elles (chargement, code provisoire), seul « Quitter » reste. */
  menuItems?: SideMenuItem[];
  menuExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const depot = useDepotPhone();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Logo href="/dashboard" />
        <SideMenu
          titre={profile?.nom}
          sousTitre={profile && `${profile.cite_nom} · Lot ${profile.lot_numero}`}
          items={
            profile && menuItems
              ? [...menuItems, { icon: "money", label: "Recharger mes points", hint: "Par Wave, avant d'être à court", onClick: () => setRechargeOpen(true) }]
              : []
          }
          onLogout={onLogout}
        >
          {menuExtra}
        </SideMenu>
      </header>
      {profile && (
        <RechargeModal
          role="client"
          open={rechargeOpen}
          onClose={() => setRechargeOpen(false)}
          depot={depot}
          soldePoints={profile.solde_points}
          essaiFin={profile.essai_fin}
          tel={profile.telephone}
        />
      )}

      {profile && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <CiteBadge>
            Tu commandes à {profile.cite_nom} · Lot {profile.lot_numero}
          </CiteBadge>
          {enEssai(profile.essai_fin) ? (
            <EssaiBadge fin={profile.essai_fin} />
          ) : (
            <>
              <StatutBadge statut={profile.statut} />
              <PointsBadge soldePoints={profile.solde_points} />
            </>
          )}
        </div>
      )}
      {profile && (
        <div className="mt-4">
          <FinEssaiBanner fin={profile.essai_fin} min={RECHARGE_MULTIPLE_CLIENT} />
        </div>
      )}

      <div className="mt-6">{children}</div>
    </main>
  );
}
