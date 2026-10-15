"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Stat } from "@/components/Consommation";
import { CloseButton, CommandeBadge, Modal, SourceBadge, Spinner } from "@/components/ui";
import { formatLitres, moisCourant, nomMois, statsChauffeurParMois, statsChauffeurVide, type StatsChauffeurMois } from "@/lib/conso";
import { CITERNES_FIDELITE, formatFcfa, formatPoints, jour, POINTS_PAR_LIVRAISON, SEUIL_FIDELITE } from "@/lib/format";
import type { ChauffeurHistorique } from "@/lib/types";

function StatsMois({ m }: { m: StatsChauffeurMois }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Stat label="Livraisons" value={String(m.livraisons)} />
      <Stat label="Eau livrée" value={formatLitres(m.litres)} />
      <Stat label="Encaissé" value={formatFcfa(m.encaisse)} />
      <Stat label="Points dépensés" value={formatPoints(m.points)} />
    </div>
  );
}

/** Progression vers la prochaine livraison offerte (total_points_utilises repart à 0 à chaque bonus). */
function Fidelite({ totalUtilise }: { totalUtilise: number }) {
  const faites = Math.floor(totalUtilise / POINTS_PAR_LIVRAISON);
  const pct = Math.min(100, (totalUtilise / SEUIL_FIDELITE) * 100);
  return (
    <div className="rounded-2xl border-brut border-ink bg-sky p-4">
      <p className="font-bold">Programme fidélité</p>
      <p className="mt-1 text-sm font-medium text-ink/70">
        {faites} / {CITERNES_FIDELITE} livraisons : encore <strong className="text-ink">{CITERNES_FIDELITE - faites}</strong> avant ta prochaine livraison offerte.
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full border-[1.5px] border-ink bg-white" role="progressbar" aria-valuenow={faites} aria-valuemin={0} aria-valuemax={CITERNES_FIDELITE}>
        <div className="h-full bg-azur" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MoisCard({ m, essai, ouvert, onToggle }: { m: StatsChauffeurMois; essai: boolean; ouvert: boolean; onToggle: () => void }) {
  return (
    <li className="brut p-4">
      <div className="mb-3">
        <p className="font-display text-lg font-bold">{nomMois(m.cle)}</p>
        <p className="text-sm font-semibold text-ink/55">
          Application {m.app} · Manuel {m.manuel}
        </p>
      </div>
      <StatsMois m={m} />
      <p className="mt-3 text-sm font-medium text-ink/70">
        Gain net : <strong className="text-ink">{formatFcfa(m.encaisse - m.points)}</strong> (encaissé − points).
      </p>
      {m.pointsOfferts > 0 && (
        <p className="mt-1 text-sm font-medium text-ink/65">
          {essai ? "Essai gratuit" : "Pendant l'essai"} : {formatPoints(m.pointsOfferts)} offerts. Hors essai, ce mois t&apos;aurait coûté{" "}
          <strong className="text-ink">{formatPoints(m.points + m.pointsOfferts)}</strong>.
        </p>
      )}
      {m.bonus > 0 && (
        <p className="mt-1 text-sm font-semibold text-azur">
          {m.bonus} livraison{m.bonus > 1 ? "s" : ""} offerte{m.bonus > 1 ? "s" : ""} (fidélité).
        </p>
      )}
      {m.annulees > 0 && (
        <p className="mt-1 text-sm font-medium text-ink/50">
          {m.annulees} commande{m.annulees > 1 ? "s" : ""} annulée{m.annulees > 1 ? "s" : ""} (points rendus).
        </p>
      )}
      <button onClick={onToggle} aria-expanded={ouvert} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-azur hover:underline">
        {ouvert ? "Masquer le détail" : `Voir le détail (${m.commandes.length})`}
      </button>
      <AnimatePresence initial={false}>
        {ouvert && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 divide-y divide-ink/10 overflow-hidden border-t border-ink/10"
          >
            {m.commandes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {jour(c.livree_at ?? c.created_at)} · Lot {c.lot_numero}
                  </p>
                  <p className="truncate text-sm text-ink/55">{c.client_nom}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge source={c.source} />
                  <CommandeBadge status={c.status} />
                  <span className="text-sm font-bold tabular-nums">{formatFcfa(c.prix)}</span>
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Statistiques de commandes du chauffeur, mois par mois (12 derniers mois). */
export function StatsChauffeurModal({
  open,
  onClose,
  historique,
  essai,
  totalUtilise,
}: {
  open: boolean;
  onClose: () => void;
  historique: ChauffeurHistorique[] | null;
  essai: boolean;
  /** total_points_utilises du profil (progression fidélité). */
  totalUtilise: number;
}) {
  const mois = useMemo(() => (historique ? statsChauffeurParMois(historique) : null), [historique]);
  const cle = moisCourant();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const courant = mois?.find((m) => m.cle === cle) ?? statsChauffeurVide(cle);
  const precedents = mois?.filter((m) => m.cle !== cle) ?? [];

  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="title-md">Mes statistiques</h2>
          <p className="text-sm font-medium text-ink/55">Tes livraisons, mois par mois (12 derniers mois).</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {mois === null ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Fidelite totalUtilise={totalUtilise} />
          <ul className="space-y-4">
            <MoisCard m={courant} essai={essai} ouvert={ouvert === cle} onToggle={() => setOuvert(ouvert === cle ? null : cle)} />
            {precedents.map((m) => (
              <MoisCard key={m.cle} m={m} essai={essai} ouvert={ouvert === m.cle} onToggle={() => setOuvert(ouvert === m.cle ? null : m.cle)} />
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
