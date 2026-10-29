"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Btn, ErrorBox, Field, Modal, ModalTitle, useConfirm } from "@/components/ui";
import { messageErreur, rpc } from "@/lib/api";
import { lienItineraire, positionActuelle } from "@/lib/gps";
import { useRpc } from "@/lib/useRpc";
import { ChoixCite } from "../shared";
import type { Cite } from "../types";

type Forage = { id: string; nom: string; cite_id: string; cite: string; lat: number | null; long: number | null; livreurs: number };

/** Forages (sources d'eau) — V2. Leur position sert à placer les livreurs sur la carte. */
export function Forages({ cites }: { cites: Cite[] }) {
  const { data, err, reload } = useRpc<Forage[]>("admin_sources", undefined, "sources");
  const [edition, setEdition] = useState<Forage | "nouveau" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const supprimer = async (f: Forage) => {
    setActionErr(null);
    if (!(await confirm(<>Supprimer le forage <strong>{f.nom}</strong> ?{f.livreurs > 0 ? ` ${f.livreurs} livreur(s) passeront « sans forage ».` : ""}</>, { danger: true, confirmLabel: "Supprimer" }))) return;
    try {
      await rpc("admin_supprimer_source", { p_id: f.id });
      await reload();
    } catch (e) {
      setActionErr(messageErreur(e));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="title-md">Forages</h2>
          <p className="text-sm text-ink/60">Là où les livreurs puisent l&apos;eau. Leur position sert à les placer sur la carte du dashboard.</p>
        </div>
        <Btn variant="white" onClick={() => setEdition("nouveau")} disabled={!cites.length}>
          <Icon name="plus" size={18} /> Nouveau forage
        </Btn>
      </div>
      {err && <ErrorBox>{err}</ErrorBox>}
      {actionErr && <ErrorBox>{actionErr}</ErrorBox>}
      {data?.length === 0 && <p className="font-semibold text-ink/50">Aucun forage.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {data?.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 rounded-2xl border-brut border-ink bg-white p-3">
            <span>
              <strong>{f.nom}</strong> · {f.cite}
              <span className="block text-sm text-ink/55">
                {f.lat !== null && f.long !== null ? (
                  <a href={lienItineraire(f.lat, f.long)} target="_blank" rel="noopener noreferrer" className="text-azur hover:underline">
                    voir sur la carte
                  </a>
                ) : (
                  "position inconnue"
                )}{" "}
                · {f.livreurs} livreur{f.livreurs > 1 ? "s" : ""}
              </span>
            </span>
            <span className="flex gap-1">
              <Btn variant="white" onClick={() => setEdition(f)}>
                Modifier
              </Btn>
              <Btn variant="danger" onClick={() => void supprimer(f)} aria-label={`Supprimer ${f.nom}`}>
                <Icon name="trash" size={18} />
              </Btn>
            </span>
          </li>
        ))}
      </ul>
      <ModalForage forage={edition} cites={cites} onClose={() => setEdition(null)} onFait={() => void reload()} />
      {dialog}
    </section>
  );
}

function ModalForage({ forage, cites, onClose, onFait }: { forage: Forage | "nouveau" | null; cites: Cite[]; onClose: () => void; onFait: () => void }) {
  const existant = forage && forage !== "nouveau" ? forage : null;
  const [cite, setCite] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [lat, setLat] = useState("");
  const [long, setLong] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [gps, setGps] = useState(false);

  useEffect(() => {
    setCite(existant?.cite_id ?? (cites.length === 1 ? cites[0].id : null));
    setNom(existant?.nom ?? "");
    setLat(existant?.lat?.toString() ?? "");
    setLong(existant?.long?.toString() ?? "");
    setErr(null);
  }, [forage, existant, cites]);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cite) return setErr("Choisis une cité.");
    setErr(null);
    try {
      await rpc("admin_enregistrer_source", {
        p_id: existant?.id ?? null,
        p_cite: cite,
        p_nom: nom,
        p_lat: lat ? Number(lat.replace(",", ".")) : null,
        p_long: long ? Number(long.replace(",", ".")) : null,
      });
      onFait();
      onClose();
    } catch (e) {
      setErr(messageErreur(e));
    }
  };

  return (
    <Modal open={!!forage} onClose={onClose}>
      <ModalTitle onClose={onClose}>{existant ? "Modifier le forage" : "Nouveau forage"}</ModalTitle>
      <form onSubmit={enregistrer} className="space-y-4">
        <div>
          <span className="label">Cité</span>
          <ChoixCite cites={cites} value={cite} onChange={setCite} />
        </div>
        <Field label="Nom">
          <input className="field" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Forage Nord" maxLength={60} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input className="field" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="5.3601" />
          </Field>
          <Field label="Longitude">
            <input className="field" inputMode="decimal" value={long} onChange={(e) => setLong(e.target.value)} placeholder="-4.0083" />
          </Field>
        </div>
        <Btn
          type="button"
          variant="white"
          className="w-full"
          disabled={gps}
          onClick={async () => {
            setGps(true);
            try {
              const p = await positionActuelle();
              setLat(p.lat.toFixed(6));
              setLong(p.long.toFixed(6));
            } catch (e) {
              setErr(messageErreur(e));
            } finally {
              setGps(false);
            }
          }}
        >
          <Icon name="pin" size={18} /> {gps ? "Localisation…" : "Je suis au forage : prendre ma position"}
        </Btn>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn type="submit" size="lg" className="w-full">
          Enregistrer
        </Btn>
      </form>
    </Modal>
  );
}
