"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sticker } from "@/components/Sticker";
import { Badge, Btn, ErrorBox, Field, Modal, ModalTitle, Spinner, SuccessBox, roleLabel, useConfirm } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { maisonsEnCsv, telechargerCsv, type MaisonExport } from "@/lib/csv";
import { STATUT_COMMANDE, dateCourte, dateHeure, points } from "@/lib/format";
import { lienItineraire } from "@/lib/gps";
import { formatPhone } from "@/lib/phone";
import { useAdminHref } from "../Bases";
import { Section, STATUT_LABEL, STATUT_TONE } from "../shared";
import type { MaisonDetail } from "../types";

const TYPE_TX: Record<string, string> = { RECHARGE: "Recharge", COMMANDE: "Commande", ANNULATION: "Annulation (recrédit)", PERTE_CLOTURE: "Perdu à la clôture" };

/** Fiche d'une maison + toutes les actions admin. Chaque action sensible
 *  demande une confirmation, et la base revérifie tout (2FA, règles). */
export function FicheMaison({ id, onClose, onChange }: { id: string | null; onClose: () => void; onChange: () => void }) {
  const [d, setD] = useState<MaisonDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [codeProvisoire, setCodeProvisoire] = useState<string | null>(null);
  const [montant, setMontant] = useState("");
  const [reference, setReference] = useState("");
  const [motif, setMotif] = useState("");
  const [occupe, setOccupe] = useState(false);
  const { confirm, dialog } = useConfirm();
  const a = useAdminHref();

  const charger = async (mid: string) => {
    try {
      setD(await rpc<MaisonDetail>("admin_maison_detail", { p_maison: mid }));
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  useEffect(() => {
    setD(null);
    setErr(null);
    setInfo(null);
    setCodeProvisoire(null);
    setMontant("");
    setReference("");
    setMotif("");
    if (id) void charger(id);
  }, [id]);

  /** Exécute une action, recharge la fiche et la liste. */
  const agir = async (fn: () => Promise<string | void>) => {
    if (!id) return;
    setErr(null);
    setInfo(null);
    setOccupe(true);
    try {
      const msg = await fn();
      if (msg) setInfo(msg);
      await charger(id);
      onChange();
    } catch (e) {
      setErr(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  const recharger = () =>
    agir(async () => {
      const m = Number(montant);
      if (!(m >= 100)) throw new Error("MONTANT_INVALIDE");
      if (!(await confirm(<>Ajouter <strong>{points(m)}</strong> au foyer {d?.foyer?.nom_famille} ?<br /><span className="text-sm text-ink/60">Achat définitif, crédit non remboursable.</span></>, { confirmLabel: "Recharger" }))) return;
      const solde = await rpc<number>("admin_recharger", { p_maison: id, p_montant: m, p_reference: reference || null });
      setMontant("");
      setReference("");
      return `Recharge enregistrée. Nouveau solde : ${points(solde)}.`;
    });

  const clore = () =>
    agir(async () => {
      if (motif.trim().length < 3) throw new Error("MOTIF_INVALIDE");
      if (!(await confirm(<>Clore le foyer <strong>{d?.foyer?.nom_famille}</strong> ? Tous ses téléphones seront déconnectés et le code maison effacé. La maison redeviendra LIBRE (le QR reste le même).</>, { danger: true, confirmLabel: "Continuer" }))) return;
      let r = await rpc<{ ok: boolean; confirmation_requise?: boolean; solde_points?: number; points_perdus?: number }>("admin_clore_foyer", {
        p_maison: id,
        p_motif: motif,
        p_confirmer_perte: false,
      });
      if (r.confirmation_requise) {
        const ok = await confirm(
          <>
            Ce foyer a <strong>{r.solde_points} points</strong>. Ils seront perdus définitivement car non remboursable. Confirmer ?
          </>,
          { danger: true, title: "Points perdus", confirmLabel: "Confirmer la perte" }
        );
        if (!ok) return;
        r = await rpc("admin_clore_foyer", { p_maison: id, p_motif: motif, p_confirmer_perte: true });
      }
      setMotif("");
      return `Foyer archivé${r.points_perdus ? ` (${points(r.points_perdus)} perdus)` : ""}. La maison est LIBRE.`;
    });

  const bloquer = () =>
    agir(async () => {
      if (!(await confirm("Bloquer cette maison ? Plus aucune commande ni inscription possible.", { danger: true, confirmLabel: "Bloquer" }))) return;
      await rpc("admin_bloquer_maison", { p_maison: id, p_motif: motif || null });
      return "Maison bloquée.";
    });

  const nouveauQr = () =>
    agir(async () => {
      if (
        !(await confirm(
          <>
            Générer un nouveau QR ? <strong>L&apos;autocollant actuel ne marchera plus</strong> : il faudra en coller un nouveau, et la famille devra retaper son code.
          </>,
          { danger: true, confirmLabel: "Nouveau QR" }
        ))
      )
        return;
      const m = await rpc<MaisonExport>("admin_regenerer_qr", { p_maison: id });
      return `Nouveau QR : ${m.qr_token}. Imprime le nouvel autocollant.`;
    });

  const codeOublie = () =>
    agir(async () => {
      if (!(await confirm("As-tu vérifié l'identité du titulaire au téléphone ? Un nouveau code va être créé et tous les téléphones de la maison seront déconnectés.", { confirmLabel: "Créer un code" }))) return;
      setCodeProvisoire(await rpc<string>("admin_reinitialiser_code", { p_maison: id }));
    });

  const supprimer = () =>
    agir(async () => {
      if (!(await confirm("Supprimer définitivement cette maison (erreur de création) ?", { danger: true, confirmLabel: "Supprimer" }))) return;
      await rpc("admin_supprimer_maison", { p_maison: id });
      onClose();
    });

  const m = d?.maison;
  const f = d?.foyer;

  // La confirmation est rendue HORS de la fiche : un élément « fixed » placé dans
  // un parent animé (transform) serait positionné par rapport à lui, pas à l'écran.
  return (
    <>
    <Modal open={!!id} onClose={onClose} wide>
      <ModalTitle onClose={onClose}>{m ? m.code_affichage : "Maison"}</ModalTitle>
      {!d && !err && <Spinner />}
      {err && <ErrorBox>{err}</ErrorBox>}
      {info && <SuccessBox>{info}</SuccessBox>}
      {codeProvisoire && (
        <div className="my-3 rounded-2xl border-brut border-azur bg-sky p-4 text-center">
          <p className="font-semibold">Nouveau code maison, à dicter au titulaire (affiché une seule fois) :</p>
          <p className="mt-2 font-display text-5xl font-bold tracking-[0.3em]">{codeProvisoire}</p>
        </div>
      )}
      {m && (
        <div className="mt-3 grid gap-6 md:grid-cols-[auto,1fr]">
          <div className="flex flex-col items-center gap-2">
            <Sticker code={m.code_affichage} lien={m.lien_qr} />
            <Link href={a(`/maisons/imprimer?ids=${m.id}`)} className="text-sm font-bold text-azur hover:underline">
              Imprimer l&apos;autocollant
            </Link>
            <button
              onClick={() => telechargerCsv(`maison-${m.code_affichage.replace(" ", "-")}.csv`, maisonsEnCsv([{ id: m.id, code_affichage: m.code_affichage, qr_token: m.qr_token, lien_qr: m.lien_qr, cite: m.cite, numero: m.numero_sequentiel }]))}
              className="text-sm font-bold text-azur hover:underline"
            >
              CSV
            </button>
            {/* Lien relatif : ouvre la page client sur le site où tu es (ex. en local pendant les tests). */}
            <a href={`/m/${m.qr_token}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-azur hover:underline">
              Ouvrir la page client
            </a>
          </div>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUT_TONE[m.statut]}>{STATUT_LABEL[m.statut]}</Badge>
              <span className="text-sm text-ink/60">
                {m.cite} · QR {m.qr_token}
              </span>
              {m.motif_blocage && <span className="text-sm text-danger">Motif : {m.motif_blocage}</span>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink/20 bg-white p-3 text-sm">
              {m.lat !== null && m.long !== null ? (
                <>
                  <span>
                    <strong>Position</strong> {m.position_source === "POSE" ? "relevée à la pose" : "relevée par un livreur"}
                    {m.position_maj ? ` le ${dateCourte(m.position_maj)}` : ""} ·{" "}
                    <a href={lienItineraire(m.lat, m.long)} target="_blank" rel="noopener noreferrer" className="font-bold text-azur hover:underline">
                      voir sur la carte
                    </a>
                  </span>
                  <Btn
                    variant="white"
                    disabled={occupe}
                    onClick={() =>
                      void agir(async () => {
                        if (!(await confirm("Effacer la position de cette maison ? Le prochain livreur pourra la relever.", { confirmLabel: "Effacer" }))) return;
                        await rpc("admin_effacer_position", { p_maison: id });
                        return "Position effacée.";
                      })
                    }
                  >
                    Effacer
                  </Btn>
                </>
              ) : (
                <span className="text-ink/60">
                  <strong>Position inconnue.</strong> Scanne l&apos;autocollant sur place avec ce compte admin (mode pose), ou le livreur la relèvera à la 1re livraison.
                </span>
              )}
            </div>

            {d.essais_rates_24h > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-pause/10 p-3 text-sm font-semibold text-pause">
                <span>
                  {d.essais_rates_24h} code{d.essais_rates_24h > 1 ? "s" : ""} faux en 24 h{d.essais_rates_24h >= 10 ? " : maison verrouillée pour les nouveaux téléphones" : ""}.
                </span>
                <Btn variant="white" disabled={occupe} onClick={() => void agir(async () => { await rpc("admin_effacer_essais", { p_maison: id }); return "Essais remis à zéro."; })}>
                  Remettre à zéro
                </Btn>
              </div>
            )}

            {f ? (
              <>
                <Section titre="Foyer">
                  <div className="rounded-2xl border-brut border-ink bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-display text-2xl font-bold">{f.nom_famille}</p>
                      {f.verifie_at ? (
                        <Badge tone="green">
                          Vérifié {f.verifie_par === "LIVREUR" ? "par le livreur" : "par l'admin"} le {dateCourte(f.verifie_at)}
                        </Badge>
                      ) : (
                        <Btn variant="white" disabled={occupe} onClick={() => void agir(async () => { await rpc("admin_verifier_foyer", { p_maison: id }); return "Foyer marqué vérifié."; })}>
                          Marquer vérifié
                        </Btn>
                      )}
                    </div>
                    <p className="mt-1 text-ink/70">
                      <a href={`tel:${f.telephone_principal}`} className="font-bold text-azur">
                        {formatPhone(f.telephone_principal)}
                      </a>{" "}
                      · depuis le {dateCourte(f.date_debut)} · {f.appareils_actifs} téléphone{f.appareils_actifs > 1 ? "s" : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      {!f.cgv_acceptees_at || f.cgv_version === "REPRISE_V2"
                        ? "Conditions « non remboursable » pas encore acceptées : demandées à la fin de l'essai, avant la 1re commande payante (recharge impossible avant)."
                        : `Conditions « non remboursable » acceptées le ${dateHeure(f.cgv_acceptees_at)} (v. ${f.cgv_version})`}
                    </p>
                    <button
                      type="button"
                      disabled={occupe}
                      onClick={() =>
                        void agir(async () => {
                          await rpc("admin_paiement", { p_type: "FOYER", p_id: id, p_statut: f.statut_paiement === "PAYE" ? "IMPAYE" : "PAYE" });
                        })
                      }
                      className={`mt-2 rounded-full border-[1.5px] px-3 py-1 text-xs font-bold ${f.statut_paiement === "PAYE" ? "border-reprise text-reprise" : "border-ink/40 text-ink/60"}`}
                    >
                      {f.statut_paiement === "PAYE" ? `Payé${f.date_paiement ? ` le ${dateCourte(f.date_paiement)}` : ""}` : "Impayé"} · changer
                    </button>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {f.membres.map((u, i) => (
                        <li key={i}>
                          <Badge tone={u.est_titulaire ? "ink" : "sky"}>
                            {u.nom} · {roleLabel(u.role)}
                            {u.telephone ? ` · ${formatPhone(u.telephone)}` : ""}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Section>

                <Section titre={`Solde : ${points(f.solde_points)}`}>
                  <div className="grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
                    <input className="field" inputMode="numeric" placeholder="Montant (points)" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, "").slice(0, 7))} />
                    <input className="field" placeholder="Réf. Wave (facultatif)" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
                    <Btn variant="azur" disabled={occupe || !montant} onClick={() => void recharger()}>
                      Recharger
                    </Btn>
                  </div>
                  <p className="text-xs text-ink/45">Crédit non remboursable</p>
                  {f.transactions.length > 0 && (
                    <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/20 bg-white text-sm">
                      {f.transactions.map((t, i) => (
                        <li key={i} className="flex justify-between gap-2 px-3 py-2">
                          <span>
                            {TYPE_TX[t.type] ?? t.type}
                            {t.reference ? <span className="text-ink/50"> · {t.reference}</span> : null}
                          </span>
                          <span className="whitespace-nowrap">
                            <strong className={t.montant > 0 ? "text-reprise" : "text-danger"}>
                              {t.montant > 0 ? "+" : ""}
                              {t.montant}
                            </strong>{" "}
                            <span className="text-ink/50">→ {t.solde_apres} · {dateHeure(t.created_at)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            ) : (
              <p className="rounded-2xl border-brut border-dashed border-ink/40 p-4 font-semibold text-ink/60">Aucun foyer : la maison attend son premier scan.</p>
            )}

            {d.commandes.length > 0 && (
              <Section titre="Dernières commandes">
                <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/20 bg-white text-sm">
                  {d.commandes.map((c) => (
                    <li key={c.reference} className="flex justify-between gap-2 px-3 py-2">
                      <span>
                        #{c.reference} · {c.commande_par} · {c.livreur}
                      </span>
                      <span className="text-ink/60">
                        {STATUT_COMMANDE[c.statut]} · {dateHeure(c.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {d.archives.length > 0 && (
              <Section titre="Anciens foyers (archives)">
                <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/20 bg-white text-sm">
                  {d.archives.map((a, i) => (
                    <li key={i} className="px-3 py-2">
                      <strong>{a.nom_famille}</strong> · {formatPhone(a.telephone_principal)} · {dateCourte(a.date_debut)} → {dateCourte(a.date_fin)}
                      <span className="block text-ink/55">{a.motif_fin}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section titre="Actions">
              <Field label="Motif (clôture ou blocage)">
                <input className="field" maxLength={200} placeholder="Ex. départ fin de bail, impayé…" value={motif} onChange={(e) => setMotif(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2 pt-1">
                {f && (
                  <Btn variant="danger" disabled={occupe} onClick={() => void clore()}>
                    Clore le foyer
                  </Btn>
                )}
                {f && (
                  <Btn variant="white" disabled={occupe} onClick={() => void codeOublie()}>
                    Code oublié
                  </Btn>
                )}
                {m.statut === "BLOQUEE" ? (
                  <Btn variant="white" disabled={occupe} onClick={() => void agir(async () => { await rpc("admin_debloquer_maison", { p_maison: id }); return "Maison débloquée."; })}>
                    Débloquer
                  </Btn>
                ) : (
                  <Btn variant="danger" disabled={occupe} onClick={() => void bloquer()}>
                    Bloquer
                  </Btn>
                )}
                <Btn variant="white" disabled={occupe} onClick={() => void nouveauQr()}>
                  Nouveau QR
                </Btn>
                {!f && d.archives.length === 0 && (
                  <Btn variant="danger" disabled={occupe} onClick={() => void supprimer()}>
                    Supprimer
                  </Btn>
                )}
              </div>
            </Section>
          </div>
        </div>
      )}
    </Modal>
    {dialog}
    </>
  );
}
