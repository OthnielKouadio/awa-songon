"use client";

import Link from "next/link";
import MapLazy from "@/components/MapLazy";
import type { MapMarker } from "@/components/MapView";
import { ErrorBox, Spinner } from "@/components/ui";
import { dateCourte, fcfa, STATUT_LIVREUR } from "@/lib/format";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useRpc } from "@/lib/useRpc";
import { useAdminHref } from "../Bases";

type Dashboard = {
  maisons: number;
  foyers: number;
  livreurs: number;
  livreurs_actifs: number;
  livreurs_a_valider: number;
  foyers_a_verifier: number;
  commandes_jour: number;
  livrees_jour: number;
  en_cours: number;
  ca_jour: number;
  essai_fin: string | null;
  carte_livreurs: { id: string; nom: string; statut: string; lat: number; long: number; origine: "GPS" | "LIVRAISON" | "FORAGE" }[];
  carte_maisons: { code: string; lat: number; long: number; statut: string }[];
};

const ORIGINE: Record<string, string> = { GPS: "GPS en direct", LIVRAISON: "en livraison", FORAGE: "à son forage" };

/** Cockpit (V2) : compteurs du jour + carte des livreurs et des maisons. */
export default function DashboardPage() {
  const a = useAdminHref();
  const { data: d, err, chargement, reload } = useRpc<Dashboard>("admin_dashboard", undefined, "dashboard");
  useLiveRefresh(["admin"], () => void reload(), 30000);

  if (chargement && !d) return <Spinner />;
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!d) return null;

  const markers: MapMarker[] = [
    ...d.carte_maisons.map((m) => ({ id: `m-${m.code}`, lat: m.lat, lng: m.long, kind: (m.statut === "OCCUPEE" ? "commande" : "source") as MapMarker["kind"], title: m.code })),
    ...d.carte_livreurs.map((l) => ({
      id: `l-${l.id}`,
      lat: l.lat,
      lng: l.long,
      kind: (l.statut === "ACTIF" ? "tricycle" : "tricycle-off") as MapMarker["kind"],
      title: l.nom,
      lines: [STATUT_LIVREUR[l.statut], `Position : ${ORIGINE[l.origine]}`],
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="title-lg">Dashboard</h1>
        {d.essai_fin && <span className="rounded-full border-brut border-azur bg-sky px-4 py-1.5 text-sm font-bold">Période d&apos;essai jusqu&apos;au {dateCourte(d.essai_fin)}</span>}
      </div>

      {(d.livreurs_a_valider > 0 || d.foyers_a_verifier > 0) && (
        <div className="space-y-2">
          {d.livreurs_a_valider > 0 && (
            <Link href={a("/livreurs")} className="block rounded-2xl border-brut border-pause bg-white p-4 font-bold text-pause hover:bg-pause/10">
              {d.livreurs_a_valider} livreur{d.livreurs_a_valider > 1 ? "s" : ""} à valider (inscrit{d.livreurs_a_valider > 1 ? "s" : ""} par le lien de recrutement) →
            </Link>
          )}
          {d.foyers_a_verifier > 0 && (
            <Link href={a("/maisons")} className="block rounded-2xl border-brut border-ink bg-white p-4 font-bold hover:bg-sky">
              {d.foyers_a_verifier} foyer{d.foyers_a_verifier > 1 ? "s" : ""} à vérifier (pas encore confirmé{d.foyers_a_verifier > 1 ? "s" : ""} sur place) →
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile k="Commandes du jour" v={String(d.commandes_jour)} />
        <Tuile k="Livrées aujourd'hui" v={String(d.livrees_jour)} />
        <Tuile k="En cours" v={String(d.en_cours)} lien={a("/commandes")} />
        <Tuile k="CA estimé du jour" v={fcfa(d.ca_jour)} sous="valeur de l'eau livrée" />
        <Tuile k="Maisons" v={String(d.maisons)} lien={a("/maisons")} />
        <Tuile k="Foyers inscrits" v={String(d.foyers)} />
        <Tuile k="Livreurs" v={String(d.livreurs)} lien={a("/livreurs")} />
        <Tuile k="En service" v={String(d.livreurs_actifs)} />
      </div>

      <section>
        <h2 className="title-md mb-3">Carte</h2>
        {markers.length === 0 ? (
          <p className="rounded-2xl border-brut border-dashed border-ink/40 p-5 text-center font-semibold text-ink/55">
            Aucune position connue : pose les autocollants en mode pose, ou ajoute la position des forages.
          </p>
        ) : (
          <MapLazy height={420} markers={markers} fitKey={`${d.carte_maisons.length}-${d.carte_livreurs.length}`} />
        )}
        <p className="mt-2 text-sm text-ink/55">Livreurs : GPS en direct pendant « J&apos;arrive chez toi », sinon la maison qu&apos;ils livrent, sinon leur forage.</p>
      </section>
    </div>
  );
}

function Tuile({ k, v, sous, lien }: { k: string; v: string; sous?: string; lien?: string }) {
  const contenu = (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-ink/55">{k}</p>
      <p className="mt-1 font-display text-3xl font-bold">{v}</p>
      {sous && <p className="text-xs text-ink/50">{sous}</p>}
    </>
  );
  return lien ? (
    <Link href={lien} className="rounded-brut border-brut border-ink bg-white p-4 shadow-hard-sm transition-colors hover:bg-sky">
      {contenu}
    </Link>
  ) : (
    <div className="rounded-brut border-brut border-ink bg-white p-4 shadow-hard-sm">{contenu}</div>
  );
}
