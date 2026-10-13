"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Btn, Counter, LinkBtn, PulseDot } from "@/components/ui";
import { api } from "@/lib/data-provider";
import {
  COMMANDES_ANNULABLES,
  distanceMetres,
  estimerMinutes,
  formatDistance,
  formatFcfa,
  formatMinutes,
  formatProgrammee,
  HEURE_LIMITE_ANNULATION,
  heure,
  MINUTES_EN_ROUTE,
  PARTAGE_GPS_MAX_MS,
  POSITION_MAX_AGE_MS,
  QUANTITE_L,
} from "@/lib/format";
import { callLink } from "@/lib/phone";
import type { LivePosition, Suivi } from "@/lib/types";
import type { MapLine, MapMarker } from "./MapView";
import MapLazy from "./MapLazy";

/**
 * Affiche l'état d'une commande, avec un message par statut :
 *   QUEUED      « Chauffeur en pause, tu seras livré aujourd'hui - Position n »
 *   PROGRAMMED  « Chauffeur hors ligne, commande programmée demain 8h »
 *   ASSIGNED    « Tu es N°3 chez Kader »
 *   EN_COURS    « Chauffeur en route - 15 min » (pas de carte)
 *   ARRIVING    carte live : position du tricycle reçue en direct, 10 min max
 * Utilisé par /suivi/[id] (lien direct) et par le tableau de bord client
 * (qui seul passe `onCancel`).
 */
export default function OrderTracker({ s, start, onCancel }: { s: Suivi; start: number; onCancel?: () => void }) {
  const livre = s.status === "LIVREE";
  const annulee = s.status === "ANNULEE";
  const arriving = s.status === "ARRIVING";
  const enRoute = s.status === "EN_COURS" || arriving;
  const attente = s.status === "QUEUED" || s.status === "PROGRAMMED";
  const before = Math.max(0, s.position_file - 1);

  // Position live : poussée par le serveur pendant ARRIVING (pas de rechargement).
  const [live, setLive] = useState<LivePosition | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setLive(null);
    if (!arriving) return;
    const unsub = api.subscribePosition(s.id, setLive);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      unsub();
      clearInterval(tick);
    };
  }, [arriving, s.id]);

  const annulationFermee = !!s.annulable_jusqua && Date.now() >= new Date(s.annulable_jusqua).getTime();

  // Le partage se coupe tout seul 10 min après « J'arrive chez toi ».
  const partageOuvert = arriving && !!s.arriving_at && now - new Date(s.arriving_at).getTime() < PARTAGE_GPS_MAX_MS;
  const fromSuivi =
    s.tricycle_lat != null && s.tricycle_long != null && s.tricycle_position_maj
      ? { lat: s.tricycle_lat, long: s.tricycle_long, at: s.tricycle_position_maj }
      : null;
  const pos = [live, fromSuivi].filter((p): p is LivePosition => !!p).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const posFraiche = partageOuvert && pos != null && now - new Date(pos.at).getTime() < POSITION_MAX_AGE_MS;

  let progress = 40;
  if (livre) progress = 100;
  else if (arriving) progress = 90;
  else if (enRoute) progress = 75;
  else if (attente) progress = 10;
  else if (start > 1) progress = 8 + ((start - s.position_file) / (start - 1)) * 60;

  const markers: MapMarker[] = [];
  const lines: MapLine[] = [];
  let distance: number | null = null;
  if (partageOuvert) {
    if (s.lat != null && s.long != null) markers.push({ id: "moi", lat: s.lat, lng: s.long, kind: "client", title: `Lot ${s.lot_numero}` });
    if (posFraiche) {
      markers.push({ id: "tricycle", lat: pos!.lat, lng: pos!.long, kind: "tricycle", title: s.chauffeur_nom });
      if (s.lat != null && s.long != null) {
        lines.push({ id: "trajet", from: [pos!.lat, pos!.long], to: [s.lat, s.long] });
        distance = distanceMetres(pos!.lat, pos!.long, s.lat, s.long);
      }
    }
  }

  const badge = livre
    ? "Livré"
    : annulee
    ? "Annulée"
    : arriving
    ? "Arrive chez toi"
    : enRoute
    ? "En route"
    : s.status === "QUEUED"
    ? "Chauffeur en pause"
    : s.status === "PROGRAMMED"
    ? "Programmée"
    : "En file d'attente";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
      <div>
        <Badge tone={livre || enRoute ? "azur" : annulee ? "danger" : attente ? "gray" : "sky"}>
          {enRoute && <PulseDot color="#FFFFFF" />}
          {badge}
        </Badge>

        <h1 className="title-xl mt-5 !text-4xl sm:!text-5xl">
          {livre ? (
            <>Livré ! Bois bien.</>
          ) : annulee ? (
            <>Commande annulée</>
          ) : arriving ? (
            <>{s.chauffeur_nom} arrive chez toi</>
          ) : enRoute ? (
            <>Chauffeur en route - {MINUTES_EN_ROUTE} min</>
          ) : s.status === "QUEUED" ? (
            <>
              Chauffeur {s.chauffeur_status === "OFFLINE" ? "hors ligne" : "en pause"}, tu seras livré aujourd&apos;hui - Position {s.position_file}
            </>
          ) : s.status === "PROGRAMMED" ? (
            s.chauffeur_status === "OFFLINE" ? (
              <>Chauffeur hors ligne, commande programmée {formatProgrammee(s.programmee_pour)}</>
            ) : (
              <>Commande programmée {formatProgrammee(s.programmee_pour)}</>
            )
          ) : (
            <>
              Tu es N°
              <motion.span
                key={s.position_file}
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mx-1 inline-block rounded-2xl bg-azur px-3 text-white"
              >
                <Counter value={s.position_file} duration={0.6} />
              </motion.span>{" "}
              chez {s.chauffeur_nom}
            </>
          )}
        </h1>
      </div>

      {/* Barre de progression */}
      {!annulee && (
        <div className="brut p-5">
          <div className="relative h-8 rounded-full border-brut border-ink bg-white">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-azur"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 50, damping: 16 }}
            />
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
      )}

      {(s.status === "ASSIGNED" || s.status === "QUEUED") && (
        <div className="grid grid-cols-2 gap-4">
          <div className="brut-sm p-4">
            <p className="font-display text-4xl font-bold leading-none text-azur">
              {s.status === "QUEUED" ? "Aujourd'hui" : <Counter value={estimerMinutes(s.position_file)} format={formatMinutes} />}
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-ink/70">
              <Icon name="clock" size={14} /> {s.status === "QUEUED" ? "dès qu'il reprend" : "temps estimé"}
            </p>
          </div>
          <div className="brut-sm p-4">
            <p className="font-display text-4xl font-bold leading-none">
              <Counter value={before} />
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink/70">en attente avant toi</p>
          </div>
        </div>
      )}

      {/* Carte live : UNIQUEMENT pendant ARRIVING, 10 min max */}
      {partageOuvert && markers.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="label !mb-0">{posFraiche ? "Le tricycle arrive" : "En attente de la position du tricycle…"}</p>
            {distance != null && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-azur">
                <PulseDot /> à {formatDistance(distance)}
              </span>
            )}
          </div>
          <MapLazy
            height={240}
            interactive={false}
            markers={markers}
            lines={lines}
            fitKey={posFraiche ? `live:${pos!.lat.toFixed(3)},${pos!.long.toFixed(3)}` : "statique"}
          />
        </div>
      )}

      <div className="brut-sm divide-y-2 divide-ink/10 overflow-hidden">
        <Row k="Cité / Lot" v={`${s.cite_nom} · Lot ${s.lot_numero}`} />
        <Row k="Commande" v={`${QUANTITE_L}L · ${formatFcfa(s.prix)}`} />
        <Row k="Tricycle" v={s.source_nom ? `${s.chauffeur_nom} · ${s.source_nom}` : s.chauffeur_nom} />
        <Row k="Commandé à" v={heure(s.created_at)} />
      </div>

      {!livre && !annulee && (
        <LinkBtn href={callLink(s.chauffeur_tel)} variant="white" size="lg" className="w-full">
          <Icon name="phone" size={20} className="text-azur" /> Appeler {s.chauffeur_nom} {s.chauffeur_tel}
        </LinkBtn>
      )}

      {onCancel && COMMANDES_ANNULABLES.includes(s.status) && (
        annulationFermee ? (
          <p className="text-center text-sm font-medium text-ink/55">
            Commande programmée : l&apos;annulation n&apos;est plus possible après {HEURE_LIMITE_ANNULATION}h la veille.
          </p>
        ) : (
          <div className="space-y-2">
            <Btn variant="danger" className="w-full" onClick={onCancel}>
              <Icon name="close" size={18} /> Annuler ma commande
            </Btn>
            {s.annulable_jusqua && (
              <p className="text-center text-sm font-medium text-ink/55">Annulable jusqu&apos;à {heure(s.annulable_jusqua)} la veille de la livraison.</p>
            )}
          </div>
        )
      )}
    </motion.div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-xs font-bold uppercase tracking-wider text-ink/50">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
}
