"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/icons";
import { Badge, Counter, LinkBtn, PulseDot } from "@/components/ui";
import { callLink, estimerMinutes, formatFcfa, formatMinutes, heure, QUANTITE_L } from "@/lib/format";
import type { Suivi } from "@/lib/types";
import MapLazy from "./MapLazy";

/**
 * Affiche l'état d'une commande : "Tu es N°3 chez Kader", barre de progression,
 * carte mini si GPS. Utilisé à la fois par /suivi/[id] (lien direct) et par le
 * tableau de bord client (commande active du compte connecté).
 */
export default function OrderTracker({ s, start }: { s: Suivi; start: number }) {
  const livre = s.status === "LIVRE";
  const enCours = s.status === "EN_COURS";
  const before = Math.max(0, s.position_file - 1);

  // progression : la file remonte → 90 % quand le chauffeur part → 100 % livré
  let progress = 40;
  if (livre) progress = 100;
  else if (enCours) progress = 90;
  else if (start > 1) progress = 8 + ((start - s.position_file) / (start - 1)) * 72;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
      <div>
        <Badge tone={livre ? "azur" : "sky"}>
          {enCours && <PulseDot />}
          {livre ? "Livré" : enCours ? "En route vers toi" : "En file d'attente"}
        </Badge>

        <h1 className="title-xl mt-5 !text-5xl sm:!text-6xl">
          {livre ? (
            <>Livré ! Bois bien.</>
          ) : enCours ? (
            <>{s.chauffeur_nom} arrive avec ton eau</>
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

      {!livre && (
        <div className="grid grid-cols-2 gap-4">
          <div className="brut-sm p-4">
            <p className="font-display text-4xl font-bold leading-none text-azur">
              {enCours ? "Bientôt" : <Counter value={estimerMinutes(s.position_file)} format={formatMinutes} />}
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-ink/70">
              <Icon name="clock" size={14} /> temps estimé
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

      <div className="brut-sm divide-y-2 divide-ink/10 overflow-hidden">
        <Row k="Cité / Lot" v={`${s.cite_nom} · Lot ${s.lot_numero}`} />
        <Row k="Commande" v={`${QUANTITE_L}L · ${formatFcfa(s.prix)}`} />
        <Row k="Tricycle" v={`${s.chauffeur_nom} · ${s.source_nom}`} />
        <Row k="Commandé à" v={heure(s.created_at)} />
      </div>

      {s.lat != null && s.long != null && (
        <div>
          <p className="label">Ta position enregistrée</p>
          <MapLazy height={220} interactive={false} markers={[{ id: "moi", lat: s.lat, lng: s.long, kind: "client", title: `Lot ${s.lot_numero}` }]} />
        </div>
      )}

      {!livre && (
        <LinkBtn href={callLink(s.chauffeur_tel)} variant="white" size="lg" className="w-full">
          <Icon name="phone" size={20} className="text-azur" /> Appeler {s.chauffeur_nom} {s.chauffeur_tel}
        </LinkBtn>
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
