"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import MapLazy from "./MapLazy";
import type { MapLine, MapMarker } from "./MapView";
import { Badge, Btn, LinkBtn } from "./ui";
import { usePositionLive, type PositionLive } from "@/lib/useLiveRefresh";
import {
  ANNULABLES,
  MINUTES_EN_ROUTE,
  dateHeure,
  distanceMetres,
  estimerMinutes,
  fcfa,
  formatDistance,
  formatMinutes,
  formatProgrammee,
} from "@/lib/format";

export type CommandeSuivi = {
  id: string;
  reference: string;
  statut: string;
  livreur_nom: string;
  livreur_telephone?: string | null;
  livreur_statut: string;
  position: number | null;
  programmee_pour: string | null;
  annulable_jusqua?: string | null;
  arriving_at: string | null;
  live: { lat: number; long: number; maj: string } | null;
  prix_fcfa?: number;
  commande_par?: string;
  created_at?: string;
};

const PARTAGE_MAX_MS = 10 * 60 * 1000;
const POSITION_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * État d'une commande, un message par statut (repris de la V2) :
 *   EN_ATTENTE  « Tu es N°3 chez Kader » + temps estimé (position × 35 min)
 *   EN_PAUSE    « Livreur en pause, tu seras livré aujourd'hui - Position n »
 *   PROGRAMMEE  « Commande programmée demain 8h »
 *   EN_ROUTE    « Livreur en route - 15 min »
 *   ARRIVE      carte en direct (10 min max) avec la distance
 * Sert dans l'espace famille et sur le lien partageable /suivi/<id>.
 */
export function SuiviLivraison({
  c,
  maison,
  onAnnuler,
}: {
  c: CommandeSuivi;
  maison: { lat: number | null; long: number | null; code_affichage: string };
  onAnnuler?: () => void;
}) {
  const arrive = c.statut === "ARRIVE";
  const enRoute = c.statut === "EN_ROUTE" || arrive;
  const [live, setLive] = useState<PositionLive | null>(null);
  const [now, setNow] = useState(() => Date.now());

  usePositionLive(arrive ? c.id : null, setLive);
  useEffect(() => {
    setLive(null);
    if (!arrive) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [arrive, c.id]);

  const partageOuvert = arrive && !!c.arriving_at && now - new Date(c.arriving_at).getTime() < PARTAGE_MAX_MS;
  const depuisServeur = c.live ? { lat: c.live.lat, long: c.live.long, at: c.live.maj } : null;
  const pos = [live, depuisServeur].filter((p): p is PositionLive => !!p).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const posFraiche = partageOuvert && !!pos && now - new Date(pos.at).getTime() < POSITION_MAX_AGE_MS;

  const markers: MapMarker[] = [];
  const lines: MapLine[] = [];
  let distance: number | null = null;
  if (partageOuvert) {
    if (maison.lat !== null && maison.long !== null) markers.push({ id: "maison", lat: maison.lat, lng: maison.long, kind: "client", title: maison.code_affichage });
    if (posFraiche && pos) {
      markers.push({ id: "livreur", lat: pos.lat, lng: pos.long, kind: "tricycle", title: c.livreur_nom });
      if (maison.lat !== null && maison.long !== null) {
        lines.push({ id: "trajet", from: [pos.lat, pos.long], to: [maison.lat, maison.long] });
        distance = distanceMetres(pos.lat, pos.long, maison.lat, maison.long);
      }
    }
  }

  const progress = arrive ? 90 : enRoute ? 75 : c.statut === "EN_ATTENTE" ? 40 : 10;
  const annulationFermee = !!c.annulable_jusqua && Date.now() >= new Date(c.annulable_jusqua).getTime();
  const annulable = !!onAnnuler && ANNULABLES.includes(c.statut) && !annulationFermee;

  const badge = arrive ? "Arrive chez toi" : enRoute ? "En route" : c.statut === "EN_PAUSE" ? "Livreur en pause" : c.statut === "PROGRAMMEE" ? "Programmée" : "En file d'attente";

  return (
    <section className="brut space-y-5 p-5">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={enRoute ? "azur" : c.statut === "EN_ATTENTE" ? "sky" : "gray"}>{badge}</Badge>
        <span className="text-sm font-bold text-ink/50">#{c.reference}</span>
      </div>

      <h2 className="font-display text-3xl font-bold leading-tight">
        {arrive ? (
          <>{c.livreur_nom} arrive chez toi</>
        ) : enRoute ? (
          <>Livreur en route - {MINUTES_EN_ROUTE} min</>
        ) : c.statut === "EN_PAUSE" ? (
          <>
            Livreur {c.livreur_statut === "HORS_LIGNE" ? "hors ligne" : "en pause"}, tu seras livré aujourd&apos;hui - Position {c.position}
          </>
        ) : c.statut === "PROGRAMMEE" ? (
          c.livreur_statut === "HORS_LIGNE" ? (
            <>Livreur hors ligne, commande programmée {formatProgrammee(c.programmee_pour)}</>
          ) : (
            <>Commande programmée {formatProgrammee(c.programmee_pour)}</>
          )
        ) : (
          <>
            Tu es N°
            <motion.span key={c.position} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-1 inline-block rounded-2xl bg-azur px-3 text-white">
              {c.position}
            </motion.span>
            chez {c.livreur_nom}
          </>
        )}
      </h2>

      {/* Barre de progression */}
      <div>
        <div className="relative h-8 rounded-full border-brut border-ink bg-white">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-azur" initial={{ width: "0%" }} animate={{ width: `${progress}%` }} transition={{ type: "spring", stiffness: 50, damping: 16 }} />
          <motion.span
            className="absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border-brut border-ink bg-white text-azur"
            initial={{ left: "0%" }}
            animate={{ left: `calc(${progress}% - 20px)` }}
            transition={{ type: "spring", stiffness: 50, damping: 16 }}
          >
            <Icon name="truck" size={22} />
          </motion.span>
        </div>
        <div className="mt-3 flex justify-between text-xs font-bold uppercase tracking-wide text-ink/50">
          <span>Commande</span>
          <span>En route</span>
          <span>Chez toi</span>
        </div>
      </div>

      {(c.statut === "EN_ATTENTE" || c.statut === "EN_PAUSE") && c.position !== null && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-brut border-ink bg-white p-4">
            <p className="font-display text-3xl font-bold leading-none text-azur">{c.statut === "EN_PAUSE" ? "Aujourd'hui" : formatMinutes(estimerMinutes(c.position))}</p>
            <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-ink/70">
              <Icon name="clock" size={14} /> {c.statut === "EN_PAUSE" ? "dès qu'il reprend" : "temps estimé"}
            </p>
          </div>
          <div className="rounded-2xl border-brut border-ink bg-white p-4">
            <p className="font-display text-3xl font-bold leading-none">{Math.max(0, c.position - 1)}</p>
            <p className="mt-1.5 text-sm font-semibold text-ink/70">en attente avant toi</p>
          </div>
        </div>
      )}

      {/* Carte en direct : UNIQUEMENT pendant « J'arrive chez toi », 10 min max */}
      {partageOuvert && markers.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="label !mb-0">{posFraiche ? "Le livreur arrive" : "En attente de la position du livreur…"}</p>
            {distance !== null && <span className="text-xs font-bold text-azur">à {formatDistance(distance)}</span>}
          </div>
          <MapLazy height={240} interactive={false} markers={markers} lines={lines} fitKey={`${c.id}-${markers.length}`} />
        </div>
      )}

      {c.commande_par && (
        <p className="text-sm text-ink/65">
          Commandé par {c.commande_par}
          {c.created_at ? ` le ${dateHeure(c.created_at)}` : ""}
          {c.prix_fcfa ? ` · ${fcfa(c.prix_fcfa)} à payer au livreur` : ""}
        </p>
      )}
      {c.statut === "PROGRAMMEE" && c.annulable_jusqua && !annulationFermee && onAnnuler && (
        <p className="text-sm text-ink/60">Annulable jusqu&apos;à {dateHeure(c.annulable_jusqua)}.</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {c.livreur_telephone && (
          <LinkBtn href={`tel:${c.livreur_telephone}`} variant="ink" size="lg" className="flex-1">
            <Icon name="phone" /> Appeler {c.livreur_nom}
          </LinkBtn>
        )}
        {annulable && (
          <Btn variant="danger" size="lg" className="flex-1" onClick={onAnnuler}>
            Annuler
          </Btn>
        )}
      </div>
    </section>
  );
}
