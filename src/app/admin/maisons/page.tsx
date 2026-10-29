"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Sticker } from "@/components/Sticker";
import { Badge, Btn, ErrorBox, Field, Modal, ModalTitle, Spinner } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { maisonsEnCsv, telechargerCsv, type MaisonExport } from "@/lib/csv";
import { points } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { useRpc } from "@/lib/useRpc";
import { useAdminHref } from "../Bases";
import { Chip, ChoixCite, STATUT_LABEL, STATUT_TONE } from "../shared";
import type { Cite, MaisonLigne, StatutMaison } from "../types";
import { FicheMaison } from "./FicheMaison";

export default function MaisonsPage() {
  const a = useAdminHref();
  const { data: cites, reload: rechargerCites } = useRpc<Cite[]>("admin_cites", undefined, "cites");
  const [cite, setCite] = useState<string | null>(null);
  const [statut, setStatut] = useState<StatutMaison | null>(null);
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [fiche, setFiche] = useState<string | null>(null);
  const [generer, setGenerer] = useState(false);
  const [unique, setUnique] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Recherche différée : pas un appel serveur à chaque lettre.
  useEffect(() => {
    const id = setTimeout(() => setRecherche(saisie.trim()), 300);
    return () => clearTimeout(id);
  }, [saisie]);

  const args = { p_cite: cite, p_statut: statut, p_recherche: recherche || null };
  const { data: maisons, err, chargement, reload } = useRpc<MaisonLigne[]>("admin_maisons", args, JSON.stringify(args));

  const exporter = async () => {
    setExportErr(null);
    try {
      const rows = await rpc<MaisonExport[]>("admin_export_maisons", { p_cite: cite, p_debut: null, p_fin: null, p_ids: null });
      const c = cites?.find((x) => x.id === cite);
      telechargerCsv(`maisons-${c?.code_court ?? "toutes"}.csv`, maisonsEnCsv(rows));
    } catch (e) {
      setExportErr(messageErreur(e));
    }
  };

  const compte = useMemo(() => {
    const m = maisons ?? [];
    return { total: m.length, aVerifier: m.filter((x) => x.statut === "OCCUPEE" && !x.verifie_at).length };
  }, [maisons]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title-lg">Maisons</h1>
          <p className="mt-1 font-semibold text-ink/60">
            {compte.total} maison{compte.total > 1 ? "s" : ""}
            {compte.aVerifier > 0 && <> · {compte.aVerifier} foyer{compte.aVerifier > 1 ? "s" : ""} à vérifier</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="white" onClick={() => setUnique(true)} disabled={!cites?.length}>
            <Icon name="plus" size={18} /> Une maison
          </Btn>
          <Btn onClick={() => setGenerer(true)} disabled={!cites?.length}>
            <Icon name="layers" size={18} /> Générer un lot
          </Btn>
        </div>
      </div>

      {cites?.length === 0 && (
        <div className="rounded-2xl border-brut border-dashed border-ink/40 p-5 text-center font-semibold">
          Commence par <Link href={a("/cites")} className="text-azur underline">créer une cité</Link> (ex. Promogim · PROMO).
        </div>
      )}

      {/* Filtres */}
      <div className="space-y-3 rounded-brut border-brut border-ink bg-white p-4">
        <input className="field" placeholder="Rechercher : PROMO 012, Koffi, 0701…, K7QX2P" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          <Chip actif={!cite} onClick={() => setCite(null)}>
            Toutes les cités
          </Chip>
          {cites?.map((c) => (
            <Chip key={c.id} actif={cite === c.id} onClick={() => setCite(c.id)}>
              {c.nom} · {c.code_court}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip actif={!statut} onClick={() => setStatut(null)}>
            Tous statuts
          </Chip>
          {(["LIBRE", "OCCUPEE", "BLOQUEE"] as StatutMaison[]).map((s) => (
            <Chip key={s} actif={statut === s} onClick={() => setStatut(s)}>
              {STATUT_LABEL[s]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-ink/10 pt-3">
          <Btn variant="white" onClick={() => void exporter()}>
            <Icon name="download" size={18} /> Exporter CSV {cite ? "(cité)" : "(tout)"}
          </Btn>
          <Link
            href={cite ? a(`/maisons/imprimer?cite=${cite}`) : a("/maisons/imprimer")}
            className="inline-flex items-center gap-2 rounded-2xl border-brut border-ink bg-white px-4 py-2.5 font-bold shadow-hard-sm hover:bg-sky"
          >
            Imprimer les autocollants
          </Link>
        </div>
        {exportErr && <ErrorBox>{exportErr}</ErrorBox>}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}
      {chargement && !maisons && <Spinner />}

      {/* Liste (cartes : lisible au téléphone comme sur ordinateur) */}
      <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {maisons?.map((m) => (
          <li key={m.id}>
            <button onClick={() => setFiche(m.id)} className="w-full rounded-2xl border-brut border-ink bg-white p-4 text-left transition-colors hover:bg-sky">
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-2xl font-bold">{m.code_affichage}</span>
                <Badge tone={STATUT_TONE[m.statut]}>{STATUT_LABEL[m.statut]}</Badge>
              </div>
              {m.nom_famille ? (
                <div className="mt-1.5 space-y-0.5 text-sm">
                  <p className="font-bold">{m.nom_famille}</p>
                  <p className="text-ink/60">
                    {formatPhone(m.telephone_principal ?? "")} · {points(m.solde_points ?? 0)}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {!m.verifie_at && <Badge tone="orange">À vérifier</Badge>}
                    {!m.a_position && <Badge tone="gray">Sans position</Badge>}
                    {m.commande_en_cours && <Badge tone="azur">Commande en cours</Badge>}
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-ink/50">
                  {m.cite} · QR {m.qr_token}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
      {maisons?.length === 0 && !chargement && <p className="py-8 text-center font-semibold text-ink/50">Aucune maison.</p>}

      <FicheMaison id={fiche} onClose={() => setFiche(null)} onChange={() => void reload()} />
      <ModalGenerer open={generer} cites={cites ?? []} citeParDefaut={cite} onClose={() => setGenerer(false)} onFait={() => { void reload(); void rechargerCites(); }} />
      <ModalUnique open={unique} cites={cites ?? []} citeParDefaut={cite} onClose={() => setUnique(false)} onFait={() => { void reload(); void rechargerCites(); }} />
    </div>
  );
}

// ─── Générer un lot ──────────────────────────────────────────────────────────

function ModalGenerer({ open, cites, citeParDefaut, onClose, onFait }: { open: boolean; cites: Cite[]; citeParDefaut: string | null; onClose: () => void; onFait: () => void }) {
  const [cite, setCite] = useState<string | null>(null);
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ maisons: MaisonExport[]; ignores: number[] } | null>(null);
  const a = useAdminHref();
  const citesRef = useRef(cites);
  citesRef.current = cites;

  // Réinitialisé à l'ouverture seulement : le rechargement de la liste des cités
  // (après la génération) ne doit pas effacer le résultat affiché.
  useEffect(() => {
    if (!open) return;
    const liste = citesRef.current;
    const c = liste.find((x) => x.id === citeParDefaut) ?? (liste.length === 1 ? liste[0] : null);
    setCite(c?.id ?? null);
    const d = (c?.dernier_numero ?? 0) + 1;
    setDebut(String(d));
    setFin(String(d + 99));
    setErr(null);
    setResultat(null);
  }, [open, citeParDefaut]);

  const choisirCite = (id: string) => {
    setCite(id);
    const d = (cites.find((x) => x.id === id)?.dernier_numero ?? 0) + 1;
    setDebut(String(d));
    setFin(String(d + 99));
  };

  const c = cites.find((x) => x.id === cite);
  const nb = Number(fin) - Number(debut) + 1;

  const lancer = async () => {
    if (!cite) return setErr("Choisis une cité.");
    setErr(null);
    setEnvoi(true);
    try {
      const r = await rpc<{ maisons: MaisonExport[]; ignores: number[] }>("admin_generer_lot", { p_cite: cite, p_debut: Number(debut), p_fin: Number(fin) });
      setResultat(r);
      onFait();
    } catch (e) {
      setErr(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalTitle onClose={onClose}>Générer un lot</ModalTitle>
      {resultat ? (
        <div className="space-y-4">
          <p className="text-lg">
            <strong>{resultat.maisons.length}</strong> maison{resultat.maisons.length > 1 ? "s" : ""} créée{resultat.maisons.length > 1 ? "s" : ""}, chacune avec son QR unique.
          </p>
          {resultat.ignores.length > 0 && (
            <p className="rounded-2xl bg-pause/10 p-3 text-sm font-semibold text-pause">
              {resultat.ignores.length} numéro{resultat.ignores.length > 1 ? "s" : ""} existai{resultat.ignores.length > 1 ? "ent" : "t"} déjà (ignoré{resultat.ignores.length > 1 ? "s" : ""}) :{" "}
              {resultat.ignores.slice(0, 20).join(", ")}
              {resultat.ignores.length > 20 ? "…" : ""}
            </p>
          )}
          {resultat.maisons.length > 0 && (
            <div className="flex flex-col gap-2">
              <Btn size="lg" onClick={() => telechargerCsv(`lot-${c?.code_court}-${debut}-${fin}.csv`, maisonsEnCsv(resultat.maisons))}>
                <Icon name="download" /> CSV pour l&apos;imprimeur
              </Btn>
              <Link
                href={a(`/maisons/imprimer?cite=${cite}&debut=${debut}&fin=${fin}`)}
                className="rounded-2xl border-brut border-ink bg-white px-6 py-4 text-center text-lg font-bold shadow-hard-sm hover:bg-sky"
              >
                Voir / imprimer les autocollants
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <span className="label">Cité</span>
            <ChoixCite cites={cites} value={cite} onChange={choisirCite} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Du numéro">
              <input className="field" inputMode="numeric" value={debut} onChange={(e) => setDebut(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </Field>
            <Field label="Au numéro">
              <input className="field" inputMode="numeric" value={fin} onChange={(e) => setFin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </Field>
          </div>
          {c && nb > 0 && (
            <p className="rounded-2xl bg-sky p-3 font-semibold">
              {nb} maison{nb > 1 ? "s" : ""} : {c.code_court} {debut.padStart(3, "0")} → {c.code_court} {fin.padStart(3, "0")}
            </p>
          )}
          {err && <ErrorBox>{err}</ErrorBox>}
          <Btn size="lg" className="w-full" onClick={() => void lancer()} disabled={envoi || !cite || !(nb > 0)}>
            {envoi ? "Génération…" : `Générer ${nb > 0 ? nb : ""} maison${nb > 1 ? "s" : ""}`}
          </Btn>
        </div>
      )}
    </Modal>
  );
}

// ─── Une seule maison ────────────────────────────────────────────────────────

function ModalUnique({ open, cites, citeParDefaut, onClose, onFait }: { open: boolean; cites: Cite[]; citeParDefaut: string | null; onClose: () => void; onFait: () => void }) {
  const [cite, setCite] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [cree, setCree] = useState<MaisonExport | null>(null);
  const a = useAdminHref();
  // Dernière liste des cités, sans relancer l'effet d'ouverture à chaque rechargement.
  const citesRef = useRef(cites);
  citesRef.current = cites;
  /** Prochain numéro libre de la cité : dernier numéro + 1. */
  const suivant = (id: string | null) => String((citesRef.current.find((x) => x.id === id)?.dernier_numero ?? 0) + 1);

  useEffect(() => {
    if (!open) return;
    const liste = citesRef.current;
    const c = liste.find((x) => x.id === citeParDefaut) ?? (liste.length === 1 ? liste[0] : null);
    setCite(c?.id ?? null);
    setNumero(suivant(c?.id ?? null));
    setErr(null);
    setCree(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, citeParDefaut]);

  const creer = async () => {
    if (!cite) return setErr("Choisis une cité.");
    setErr(null);
    try {
      setCree(await rpc<MaisonExport>("admin_creer_maison_unique", { p_cite: cite, p_numero: Number(numero) }));
      onFait();
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalTitle onClose={onClose}>Nouvelle maison</ModalTitle>
      {cree ? (
        <div className="space-y-4">
          <div className="flex justify-center">
            <Sticker code={cree.code_affichage} lien={cree.lien_qr} />
          </div>
          <Btn className="w-full" onClick={() => telechargerCsv(`maison-${cree.code_affichage.replace(" ", "-")}.csv`, maisonsEnCsv([cree]))}>
            <Icon name="download" size={18} /> CSV
          </Btn>
          <Link href={a(`/maisons/imprimer?ids=${cree.id}`)} className="block rounded-2xl border-brut border-ink bg-white px-4 py-2.5 text-center font-bold hover:bg-sky">
            Imprimer cet autocollant
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <span className="label">Cité</span>
            <ChoixCite
              cites={cites}
              value={cite}
              onChange={(id) => {
                setCite(id);
                setNumero(suivant(id));
                setErr(null);
              }}
            />
          </div>
          <Field label="Numéro" hint="Le prochain numéro libre est proposé automatiquement.">
            <input className="field" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          {err && <ErrorBox>{err}</ErrorBox>}
          <Btn size="lg" className="w-full" onClick={() => void creer()} disabled={!cite || !numero}>
            Créer
          </Btn>
        </div>
      )}
    </Modal>
  );
}
