"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { fmtFcfa, fmtNombre, fmtPct, MOIS, type parZone, type seriesMensuelles } from "@/lib/stats";
import { ChartCard, COULEURS, TooltipBox } from "./ui";

type Mensuel = ReturnType<typeof seriesMensuelles>;
type Zones = ReturnType<typeof parZone>;

const AXE = { fontSize: 12, fill: COULEURS.texte };
const GRILLE = <CartesianGrid vertical={false} stroke={COULEURS.grille} strokeDasharray="0" />;
const LEGENDE = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: COULEURS.texte, paddingTop: 8 }} />;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));

/** Infobulle mensuelle générique : chaque série avec sa pastille et sa valeur formatée. */
function tooltipMensuel(format: (v: number) => string) {
  function MensuelTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const numero = (payload[0].payload as { numero: number }).numero;
    return (
      <TooltipBox
        titre={MOIS[numero - 1]}
        lignes={payload.map((p) => ({ couleur: String(p.color), label: String(p.name), valeur: p.value == null ? "—" : format(Number(p.value)) }))}
      />
    );
  }
  return MensuelTooltip;
}

/** Barres atténuées hors du mois filtré (le contexte annuel reste visible). */
const opacite = (numero: number, mois: number) => (mois && numero !== mois ? 0.35 : 1);

export function CommandesParMois({ data, mois, vide }: { data: Mensuel; mois: number; vide: boolean }) {
  return (
    <ChartCard titre="Commandes par mois" sousTitre="Application et saisie manuelle" vide={vide}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          {GRILLE}
          <XAxis dataKey="mois" tick={AXE} axisLine={{ stroke: COULEURS.grille }} tickLine={false} />
          <YAxis tick={AXE} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={tooltipMensuel(fmtNombre)} />
          {LEGENDE}
          <Bar dataKey="app" name="Application" fill={COULEURS.serie[0]} radius={[4, 4, 0, 0]} maxBarSize={16}>
            {data.map((d) => (
              <Cell key={d.numero} fillOpacity={opacite(d.numero, mois)} />
            ))}
          </Bar>
          <Bar dataKey="manual" name="Manuel" fill={COULEURS.serie[1]} radius={[4, 4, 0, 0]} maxBarSize={16}>
            {data.map((d) => (
              <Cell key={d.numero} fillOpacity={opacite(d.numero, mois)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CaParMois({ data, vide }: { data: Mensuel; vide: boolean }) {
  return (
    <ChartCard titre="Chiffre d'affaires par mois" sousTitre="Commandes livrées, en FCFA" vide={vide}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="ca-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COULEURS.serie[0]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COULEURS.serie[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {GRILLE}
          <XAxis dataKey="mois" tick={AXE} axisLine={{ stroke: COULEURS.grille }} tickLine={false} />
          <YAxis tick={AXE} axisLine={false} tickLine={false} tickFormatter={compact} />
          <Tooltip cursor={{ stroke: COULEURS.axe, strokeWidth: 1 }} content={tooltipMensuel(fmtFcfa)} />
          <Area
            type="monotone"
            dataKey="ca"
            name="Chiffre d'affaires"
            stroke={COULEURS.serie[0]}
            strokeWidth={2}
            fill="url(#ca-fill)"
            activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function PerformanceChauffeurs({ data, vide }: { data: { nom: string; livraisons: number }[]; vide: boolean }) {
  const lignes = data.slice(0, 10);
  const hauteur = Math.max(160, lignes.length * 34 + 24);
  return (
    <ChartCard titre="Performance par chauffeur" sousTitre="Livraisons effectuées, 10 premiers" vide={vide} hauteur={hauteur}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={lignes} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={COULEURS.grille} />
          <XAxis type="number" tick={AXE} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="nom" tick={AXE} axisLine={false} tickLine={false} width={96} />
          <Tooltip
            cursor={{ fill: "#f1f5f9" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  titre={String((payload[0].payload as { nom: string }).nom)}
                  lignes={[{ couleur: COULEURS.serie[0], label: "Livraisons", valeur: fmtNombre(Number(payload[0].value)) }]}
                />
              ) : null
            }
          />
          <Bar dataKey="livraisons" name="Livraisons" fill={COULEURS.serie[0]} radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="livraisons" position="right" style={{ fontSize: 12, fill: "#0f172a" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RepartitionZones({ data, parLot, vide }: { data: Zones; parLot: boolean; vide: boolean }) {
  const couleur = (nom: string, i: number) => (nom === "Autres" ? COULEURS.autres : COULEURS.serie[i % COULEURS.serie.length]);
  return (
    <ChartCard titre={parLot ? "Répartition par lot" : "Répartition par zone"} sousTitre="Part des commandes" vide={vide}>
      <div className="flex h-full flex-col gap-4 sm:flex-row sm:items-center">
        <div className="h-48 shrink-0 sm:h-full sm:w-1/2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      titre={String(payload[0].name)}
                      lignes={[
                        {
                          couleur: String((payload[0].payload as { fill?: string }).fill ?? COULEURS.serie[0]),
                          label: "Commandes",
                          valeur: `${fmtNombre(Number(payload[0].value))} · ${fmtPct((payload[0].payload as { pct: number }).pct)}`,
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Pie
                data={data}
                dataKey="total"
                nameKey="nom"
                innerRadius="58%"
                outerRadius="88%"
                paddingAngle={data.length > 1 ? 1 : 0}
                stroke="#fff"
                strokeWidth={data.length > 1 ? 2 : 0}
              >
                {data.map((z, i) => (
                  <Cell key={z.nom} fill={couleur(z.nom, i)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5 overflow-y-auto text-sm">
          {data.map((z, i) => (
            <li key={z.nom} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: couleur(z.nom, i) }} aria-hidden />
              <span className="truncate text-slate-700">{z.nom}</span>
              <span className="ml-auto shrink-0 tabular-nums text-slate-500">{fmtNombre(z.total)}</span>
              <span className="w-16 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">{fmtPct(z.pct)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

export function TauxParMois({ data, vide }: { data: Mensuel; vide: boolean }) {
  const ligne = { strokeWidth: 2, dot: { r: 3, strokeWidth: 0 }, activeDot: { r: 4, stroke: "#fff", strokeWidth: 2 }, connectNulls: false } as const;
  return (
    <ChartCard titre="Taux de réussite par mois" sousTitre="Part des commandes livrées, annulées et en échec" vide={vide}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          {GRILLE}
          <XAxis dataKey="mois" tick={AXE} axisLine={{ stroke: COULEURS.grille }} tickLine={false} />
          <YAxis tick={AXE} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v} %`} />
          <Tooltip cursor={{ stroke: COULEURS.axe, strokeWidth: 1 }} content={tooltipMensuel((v) => fmtPct(v))} />
          {LEGENDE}
          <Line type="monotone" dataKey="reussie" name="Réussie" stroke={COULEURS.reussie} fill={COULEURS.reussie} {...ligne} />
          <Line type="monotone" dataKey="annulee" name="Annulée" stroke={COULEURS.annulee} fill={COULEURS.annulee} {...ligne} />
          <Line type="monotone" dataKey="echec" name="Échec" stroke={COULEURS.echec} fill={COULEURS.echec} {...ligne} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function NouveauxRecurrents({ data, mois, vide }: { data: Mensuel; mois: number; vide: boolean }) {
  return (
    <ChartCard titre="Nouveaux et récurrents par mois" sousTitre="Clients distincts ayant commandé dans le mois" vide={vide}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          {GRILLE}
          <XAxis dataKey="mois" tick={AXE} axisLine={{ stroke: COULEURS.grille }} tickLine={false} />
          <YAxis tick={AXE} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={tooltipMensuel(fmtNombre)} />
          {LEGENDE}
          <Bar dataKey="nouveaux" name="Nouveaux" stackId="clients" fill={COULEURS.serie[0]} stroke="#fff" strokeWidth={1} maxBarSize={24}>
            {data.map((d) => (
              <Cell key={d.numero} fillOpacity={opacite(d.numero, mois)} />
            ))}
          </Bar>
          <Bar dataKey="recurrents" name="Récurrents" stackId="clients" fill={COULEURS.serie[1]} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24}>
            {data.map((d) => (
              <Cell key={d.numero} fillOpacity={opacite(d.numero, mois)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
