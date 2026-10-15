"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { CloseButton, CommandeBadge, Modal, SourceBadge, Spinner } from "@/components/ui";
import { consoParMois, consoVide, formatLitres, moisCourant, nomMois, projectionMois, totalHorsEssai, type ConsoMois } from "@/lib/conso";
import { COUT_COMMANDE_CLIENT, formatFcfa, formatPoints, jour } from "@/lib/format";
import type { ClientHistorique } from "@/lib/types";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-ink/15 bg-white px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function StatsMois({ m }: { m: ConsoMois }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Stat label="Citernes" value={String(m.citernes)} />
      <Stat label="Eau reçue" value={formatLitres(m.litres)} />
      <Stat label="Coût de l'eau" value={formatFcfa(m.eau)} />
      <Stat label="Frais appli" value={formatPoints(m.frais)} />
    </div>
  );
}

/** Pendant l'essai : ce que le mois aurait coûté si les frais d'appli étaient débités. */
function SimulationEssai({ m }: { m: ConsoMois }) {
  const projection = projectionMois(m);
  return (
    <div className="mt-4 rounded-2xl border-brut border-ink bg-sky p-4">
      <p className="flex items-center gap-2 font-bold">
        <Icon name="money" size={18} className="text-azur" /> Simulation hors essai gratuit
      </p>
      {m.citernes === 0 ? (
        <p className="mt-1.5 text-sm font-medium text-ink/70">
          Aucune citerne livrée ce mois-ci. Après l&apos;essai, chaque commande coûtera {formatPoints(COUT_COMMANDE_CLIENT)} de frais en plus du prix de l&apos;eau.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-sm font-medium text-ink/70">
            Sans ton essai, ce mois t&apos;aurait coûté <strong className="text-ink">{formatFcfa(totalHorsEssai(m))}</strong> : {formatFcfa(m.eau)} d&apos;eau +{" "}
            {formatPoints(m.frais + m.fraisOfferts)} de frais ({formatPoints(COUT_COMMANDE_CLIENT)} par commande).
          </p>
          {projection != null && (
            <p className="mt-1 text-sm font-medium text-ink/70">
              À ce rythme, compte environ <strong className="text-ink">{formatFcfa(projection)}</strong> par mois après l&apos;essai.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Consommation du mois en cours (menu du client), avec la simulation pendant l'essai. */
export function ConsoMoisModal({
  open,
  onClose,
  historique,
  essai,
  onHistorique,
}: {
  open: boolean;
  onClose: () => void;
  historique: ClientHistorique[] | null;
  essai: boolean;
  onHistorique: () => void;
}) {
  const cle = moisCourant();
  const m = useMemo(() => (historique ? consoParMois(historique).find((x) => x.cle === cle) : undefined) ?? consoVide(cle), [historique, cle]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="title-md">Ma conso du mois</h2>
          <p className="text-sm font-semibold text-ink/50">{nomMois(cle)}</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {historique === null ? (
        <Spinner label="Calcul de ta consommation" />
      ) : (
        <>
          <div className="mt-4">
            <StatsMois m={m} />
          </div>
          {essai ? (
            <SimulationEssai m={m} />
          ) : (
            <p className="mt-4 text-sm font-medium text-ink/70">
              Total du mois : <strong className="text-ink">{formatFcfa(m.eau + m.frais)}</strong> (eau + frais d&apos;appli).
            </p>
          )}
          <button onClick={onHistorique} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-azur hover:underline">
            Voir mon historique <Icon name="arrow" size={16} />
          </button>
        </>
      )}
    </Modal>
  );
}

function MoisCard({ m, essai, ouvert, onToggle }: { m: ConsoMois; essai: boolean; ouvert: boolean; onToggle: () => void }) {
  return (
    <li className="brut p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="font-display text-lg font-bold">{nomMois(m.cle)}</p>
        <p className="text-sm font-bold tabular-nums">{formatFcfa(m.eau + m.frais)}</p>
      </div>
      <StatsMois m={m} />
      {m.fraisOfferts > 0 && (
        <p className="mt-3 text-sm font-medium text-ink/65">
          {essai ? "Essai gratuit" : "Pendant l'essai"} : {formatPoints(m.fraisOfferts)} de frais offerts. Hors essai, ce mois aurait coûté{" "}
          <strong className="text-ink">{formatFcfa(totalHorsEssai(m))}</strong>.
        </p>
      )}
      {m.annulees > 0 && (
        <p className="mt-1 text-sm font-medium text-ink/50">
          {m.annulees} commande{m.annulees > 1 ? "s" : ""} annulée{m.annulees > 1 ? "s" : ""} (non comptée{m.annulees > 1 ? "s" : ""}).
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
                  <p className="font-semibold">{jour(c.livree_at ?? c.created_at)}</p>
                  <p className="truncate text-sm text-ink/55">Chauffeur : {c.chauffeur_nom}</p>
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

/** Historique de consommation d'eau, mois par mois (12 derniers mois). */
export function HistoriqueModal({
  open,
  onClose,
  historique,
  essai,
}: {
  open: boolean;
  onClose: () => void;
  historique: ClientHistorique[] | null;
  essai: boolean;
}) {
  const mois = useMemo(() => (historique ? consoParMois(historique) : null), [historique]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const total = mois?.reduce((t, m) => ({ citernes: t.citernes + m.citernes, litres: t.litres + m.litres, depense: t.depense + m.eau + m.frais }), {
    citernes: 0,
    litres: 0,
    depense: 0,
  });

  return (
    <Modal open={open} onClose={onClose} wide>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="title-md">Mon historique</h2>
          <p className="text-sm font-medium text-ink/55">Ta consommation d&apos;eau, mois par mois (12 derniers mois).</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {mois === null ? (
        <Spinner />
      ) : mois.length === 0 ? (
        <div className="brut p-6">
          <p className="title-md">Aucune commande pour l&apos;instant</p>
          <p className="mt-2 font-medium text-ink/60">Ta consommation apparaîtra ici dès ta première citerne livrée.</p>
        </div>
      ) : (
        <>
          {total && (
            <p className="mb-4 rounded-2xl bg-mist px-4 py-3 text-sm font-semibold text-ink/70">
              Sur la période : {total.citernes} citerne{total.citernes > 1 ? "s" : ""} · {formatLitres(total.litres)} ·{" "}
              <span className="text-ink">{formatFcfa(total.depense)}</span>
            </p>
          )}
          <ul className="space-y-4">
            {mois.map((m) => (
              <MoisCard key={m.cle} m={m} essai={essai} ouvert={ouvert === m.cle} onToggle={() => setOuvert(ouvert === m.cle ? null : m.cle)} />
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
