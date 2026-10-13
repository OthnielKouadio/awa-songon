"use client";

import { motion } from "framer-motion";
import { estimerMinutes, formatFcfa, formatMinutes, formatProgrammee, prochain8h, QUANTITE_L } from "@/lib/format";
import type { TricycleDispo } from "@/lib/types";
import { Icon } from "./icons";
import { Badge, Btn, Counter, PulseDot } from "./ui";

/** Quand le client sera livré s'il commande maintenant (le chauffeur ne refuse jamais). */
export function delaiLivraison(t: TricycleDispo): string | null {
  if (t.status === "PAUSED") return "Aujourd'hui";
  if (t.status === "OFFLINE") return formatProgrammee(prochain8h().toISOString()).replace(/^./, (c) => c.toUpperCase());
  return null;
}

export default function TricycleCard({
  t,
  index,
  onChoose,
}: {
  t: TricycleDispo;
  index: number;
  onChoose: (t: TricycleDispo) => void;
}) {
  const minutes = estimerMinutes(t.file_count + 1);
  const enRoute = t.etat === "EN_ROUTE";
  const delai = delaiLivraison(t);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 200, damping: 26, delay: index * 0.07 }}
      className="brut p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="title-md flex items-center gap-2 truncate">
            <Icon name="truck" size={26} className="text-azur" />
            {t.nom}
          </h3>
          {t.source_nom && <p className="mt-1 font-medium text-ink/60">Source : {t.source_nom}</p>}
        </div>
        {t.status === "ACTIVE" ? (
          <Badge tone={enRoute ? "azur" : "sky"}>
            <PulseDot color={enRoute ? "#FFFFFF" : "#0096FF"} pulse={enRoute} />
            {enRoute ? "En route" : "À la source"}
          </Badge>
        ) : (
          <Badge tone="gray">
            <Icon name={t.status === "PAUSED" ? "pause" : "power"} size={12} />
            {t.status === "PAUSED" ? "En pause" : "Hors ligne"}
          </Badge>
        )}
      </div>

      {/* Une commande = un voyage = 1000 L, au prix fixé par le chauffeur */}
      <div className="mt-5 flex items-baseline justify-between gap-3 rounded-2xl border-[1.5px] border-azur bg-sky px-4 py-3">
        <span className="font-display text-xl font-bold text-azur">{QUANTITE_L}L</span>
        <span className="font-display text-2xl font-bold">{formatFcfa(t.prix_1000)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-brut border-ink bg-white p-3.5">
          <p className="font-display text-4xl font-bold leading-none">
            <Counter value={t.file_count} />
          </p>
          <p className="mt-1.5 text-sm font-semibold text-ink/70">en attente</p>
        </div>
        <div className="rounded-2xl border-brut border-ink bg-white p-3.5">
          <p className={`font-display font-bold leading-none text-azur ${delai ? "text-2xl" : "text-4xl"}`}>
            {delai ?? <Counter value={minutes} format={formatMinutes} />}
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-ink/70">
            <Icon name="clock" size={14} /> {delai ? "livraison prévue" : "temps estimé"}
          </p>
        </div>
      </div>

      <Btn variant="ink" size="lg" className="mt-5 w-full" onClick={() => onChoose(t)}>
        Choisir ce tricycle <Icon name="arrow" size={20} />
      </Btn>
    </motion.li>
  );
}
