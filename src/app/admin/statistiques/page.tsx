"use client";

import {
  ArrowLeft,
  CircleCheck,
  Clock,
  Download,
  FileSpreadsheet,
  Package,
  PenLine,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Smartphone,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CaParMois, CommandesParMois, NouveauxRecurrents, PerformanceChauffeurs, RepartitionZones, TauxParMois } from "@/components/stats/Charts";
import RecapTable from "@/components/stats/RecapTable";
import { ChartSkeleton, FilterSelect, KpiCard, KpiSkeleton } from "@/components/stats/ui";
import { usePrivateBase } from "@/components/PrivateBase";
import { api } from "@/lib/data-provider";
import { AppError, errorMessage } from "@/lib/errors";
import { clearSession, readSession } from "@/lib/session";
import {
  ANNEES,
  calculerKpis,
  exporterCsv,
  exporterExcel,
  fmtDuree,
  fmtFcfa,
  fmtNombre,
  fmtPct,
  MOIS,
  parChauffeur,
  parZone,
  recapMensuel,
  seriesMensuelles,
} from "@/lib/stats";
import type { Creds, YearlyStats } from "@/lib/types";

export default function StatistiquesPage() {
  const router = useRouter();
  const [creds, setCreds] = useState<Creds | null>(null);

  useEffect(() => {
    const s = readSession();
    if (!s || s.role !== "admin") router.replace("/login");
    else setCreds(s);
  }, [router]);

  if (!creds) return null;
  return <Statistiques creds={creds} />;
}

function Statistiques({ creds }: { creds: Creds }) {
  const router = useRouter();
  const base = usePrivateBase();
  const [annee, setAnnee] = useState(2026);
  const [mois, setMois] = useState(0);
  const [cite, setCite] = useState("");
  const [chauffeur, setChauffeur] = useState("");
  const [stats, setStats] = useState<YearlyStats | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setStats(await api.admin.statsAnnuelles(creds, annee, cite || null, chauffeur || null));
      setErreur("");
    } catch (e) {
      if (e instanceof AppError && e.code === "REFUSE") {
        clearSession();
        router.replace("/login");
        return;
      }
      setErreur(errorMessage(e));
    } finally {
      setChargement(false);
    }
  }, [creds, annee, cite, chauffeur, router]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const vue = useMemo(() => {
    if (!stats) return null;
    const kpis = calculerKpis(stats, mois);
    const recap = recapMensuel(stats, mois);
    const mensuel = seriesMensuelles(stats);
    const chauffeurs = parChauffeur(stats, mois);
    const zones = parZone(stats, mois, !!cite);
    return { kpis, recap, mensuel, chauffeurs, zones, anneeVide: stats.mois.every((m) => m.total === 0) };
  }, [stats, mois, cite]);

  const optionsChauffeurs = useMemo(
    () => (stats?.options.chauffeurs ?? []).filter((c) => !cite || c.cite_id === cite),
    [stats, cite]
  );

  const periode = `${mois ? `${MOIS[mois - 1]} ` : ""}${annee}`;
  const nomFichier = `statistiques-${annee}${mois ? `-${String(mois).padStart(2, "0")}` : ""}`;

  async function exporter(format: "csv" | "xlsx") {
    if (!vue) return;
    setExportEnCours(true);
    try {
      if (format === "csv") exporterCsv(vue.recap.lignes, vue.recap.total, nomFichier);
      else await exporterExcel(vue.recap.lignes, vue.recap.total, vue.kpis, vue.chauffeurs, periode, nomFichier);
    } catch (e) {
      setErreur(errorMessage(e));
    } finally {
      setExportEnCours(false);
    }
  }

  const boutonsExport = (
    <>
      <button
        type="button"
        onClick={() => exporter("csv")}
        disabled={!vue || exportEnCours}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        <Download size={15} /> Exporter en CSV
      </button>
      <button
        type="button"
        onClick={() => exporter("xlsx")}
        disabled={!vue || exportEnCours}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
      >
        <FileSpreadsheet size={15} /> Exporter en Excel
      </button>
    </>
  );

  const k = vue?.kpis;
  const anneePrec = annee - 1;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4 pt-6">
        <div>
          <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft size={15} /> Retour au cockpit
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Statistiques</h1>
          <p className="text-sm text-slate-500">Activité de la plateforme · {periode}</p>
        </div>
      </header>

      {/* Filtres globaux */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <FilterSelect label="Année" value={String(annee)} onChange={(v) => setAnnee(Number(v))} options={ANNEES.map((a) => ({ value: String(a), label: String(a) }))} />
          <FilterSelect
            label="Mois"
            value={String(mois)}
            onChange={(v) => setMois(Number(v))}
            options={[{ value: "0", label: "Tous" }, ...MOIS.map((m, i) => ({ value: String(i + 1), label: m }))]}
          />
          <FilterSelect
            label="Zone / Quartier"
            value={cite}
            onChange={(v) => {
              setCite(v);
              setChauffeur("");
            }}
            options={[{ value: "", label: "Toutes" }, ...(stats?.options.cites ?? []).map((c) => ({ value: c.id, label: c.nom }))]}
          />
          <FilterSelect
            label="Chauffeur"
            value={chauffeur}
            onChange={setChauffeur}
            options={[{ value: "", label: "Tous" }, ...optionsChauffeurs.map((c) => ({ value: c.id, label: c.nom }))]}
          />
          <div className="col-span-2 flex flex-wrap gap-2 md:col-span-4 lg:col-span-1">{boutonsExport}</div>
        </div>
      </div>

      {erreur && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erreur}</p>}

      <div className={`mt-6 space-y-8 transition-opacity ${chargement && vue ? "opacity-60" : ""}`} aria-busy={chargement}>
        {/* Section 1 : indicateurs */}
        <section aria-label="Indicateurs clés">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {!k ? (
              Array.from({ length: 12 }, (_, i) => <KpiSkeleton key={i} />)
            ) : (
              <>
                <KpiCard
                  icon={ShoppingCart}
                  titre={mois ? "Total commandes du mois" : "Total commandes année"}
                  valeur={fmtNombre(k.total)}
                  detail={
                    <Variation
                      valeur={k.variation}
                      reference={
                        mois
                          ? `${MOIS[mois - 1].toLowerCase()} ${anneePrec}`
                          : k.periodeComparee
                          ? `janvier–${MOIS[k.periodeComparee - 1].toLowerCase()} ${anneePrec}`
                          : String(anneePrec)
                      }
                    />
                  }
                />
                <KpiCard icon={Smartphone} titre="Commandes application" valeur={fmtNombre(k.app)} detail={k.total ? `${fmtPct(k.appPct)} du total` : "Aucune commande"} />
                <KpiCard icon={PenLine} titre="Commandes manuelles" valeur={fmtNombre(k.manual)} detail={k.total ? `${fmtPct(k.manualPct)} du total` : "Aucune commande"} />
                <KpiCard icon={Package} titre="Bidons livrés" valeur={fmtNombre(k.bidons)} detail={`Saisies manuelles · ${fmtNombre(k.livrees)} livraisons au total`} />

                <KpiCard
                  icon={Wallet}
                  titre="Chiffre d'affaires"
                  valeur={fmtFcfa(k.ca)}
                  detail={k.caMoyenMois != null ? `${fmtFcfa(k.caMoyenMois)} en moyenne par mois` : "Commandes livrées du mois"}
                />
                <KpiCard icon={Receipt} titre="Panier moyen" valeur={k.panierMoyen == null ? "—" : fmtFcfa(k.panierMoyen)} detail={`Sur ${fmtNombre(k.livrees)} commandes livrées`} />
                <KpiCard
                  icon={RotateCcw}
                  titre="Avoirs / remboursements"
                  valeur={fmtFcfa(k.remboursements)}
                  detail={`${fmtNombre(k.remboursementsNb)} cas crédités`}
                />
                <KpiCard
                  icon={UserCheck}
                  titre="Revenu moyen par client actif"
                  valeur={k.revenuParClient == null ? "—" : fmtFcfa(k.revenuParClient)}
                  detail={`${fmtNombre(k.clientsActifs)} clients actifs`}
                />

                <KpiCard icon={Users} titre="Clients actifs" valeur={fmtNombre(k.clientsActifs)} detail="Au moins une commande sur la période" />
                <KpiCard icon={UserPlus} titre="Nouveaux clients" valeur={fmtNombre(k.nouveaux)} detail={`${fmtNombre(k.recurrents)} récurrents (plus de 3 commandes)`} />
                <KpiCard
                  icon={CircleCheck}
                  titre="Taux de livraison réussie"
                  valeur={fmtPct(k.tauxReussite)}
                  detail={`Annulation ${fmtPct(k.tauxAnnulation)} · Échec ${fmtPct(k.tauxEchec)}`}
                />
                <KpiCard icon={Clock} titre="Temps moyen de livraison" valeur={fmtDuree(k.tempsMoyen)} detail="De la commande à la livraison" />
              </>
            )}
          </div>
        </section>

        {/* Section 2 : graphiques */}
        <section aria-label="Graphiques" className="grid gap-4 lg:grid-cols-2">
          {!vue ? (
            Array.from({ length: 6 }, (_, i) => <ChartSkeleton key={i} />)
          ) : (
            <>
              <CommandesParMois data={vue.mensuel} mois={mois} vide={vue.anneeVide} />
              <CaParMois data={vue.mensuel} vide={vue.mensuel.every((m) => m.ca === 0)} />
              <PerformanceChauffeurs data={vue.chauffeurs} vide={vue.chauffeurs.length === 0} />
              <RepartitionZones data={vue.zones} parLot={!!cite} vide={vue.zones.length === 0} />
              <TauxParMois data={vue.mensuel} vide={vue.anneeVide} />
              <NouveauxRecurrents data={vue.mensuel} mois={mois} vide={vue.anneeVide} />
            </>
          )}
        </section>

        {/* Section 3 : récapitulatif */}
        {vue ? <RecapTable lignes={vue.recap.lignes} total={vue.recap.total} actions={boutonsExport} /> : <ChartSkeleton hauteur={320} />}

        <p className="text-xs text-slate-400">
          Chiffre d&apos;affaires et panier moyen calculés sur les commandes livrées. Échec : commande encore ouverte après son jour de livraison prévu.
          Bidons : quantité déclarée lors des saisies manuelles. Temps moyen : livraisons enregistrées depuis la mise en place du suivi.
        </p>
      </div>
    </main>
  );
}

function Variation({ valeur, reference }: { valeur: number | null; reference: string }) {
  if (valeur == null) return <span>Pas de données en {reference}</span>;
  const hausse = valeur >= 0;
  const Icone = hausse ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${hausse ? "text-emerald-700" : "text-red-700"}`}>
      <Icone size={13} aria-hidden />
      {hausse ? "+" : ""}
      {fmtPct(valeur)} vs {reference}
    </span>
  );
}
