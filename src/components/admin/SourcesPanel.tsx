"use client";

import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { api } from "@/lib/api";
import type { AdminData, Creds, Source } from "@/lib/types";
import { Icon } from "../icons";
import { Btn, ErrorBox, Field } from "../ui";
import { Panel, Row, SmallBtn, useMutation } from "./shared";

const EMPTY = { nom: "", cite_id: "", lat: "", long: "" };

export default function SourcesPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, busy, error, setError } = useMutation(reload);
  const [editing, setEditing] = useState<Source | null>(null);
  const [form, setForm] = useState(EMPTY);
  const citeNom = (id: string) => data.cites.find((c) => c.id === id)?.nom ?? "?";

  function reset() {
    setEditing(null);
    setForm(EMPTY);
    setError("");
  }

  function useMyPosition() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, lat: p.coords.latitude.toFixed(6), long: p.coords.longitude.toFixed(6) })),
      () => setError("Impossible de récupérer ta position."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
    const lat = num(form.lat);
    const long = num(form.long);
    if ((lat === null) !== (long === null)) return setError("Renseigne la latitude ET la longitude (ou aucune).");
    if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (long !== null && (!Number.isFinite(long) || Math.abs(long) > 180)))
      return setError("Coordonnées invalides.");
    if (!form.cite_id) return setError("Choisis une cité.");

    const row = { nom: form.nom.trim(), cite_id: form.cite_id, lat, long };
    if (await run(() => api.admin.save(creds, "sources", editing?.id ?? null, row))) reset();
  }

  function remove(s: Source) {
    const n = data.tricycles.filter((t) => t.source_id === s.id).length;
    if (!confirm(`Supprimer « ${s.nom} » ?\n\nCela supprime aussi ses ${n} chauffeur(s) et leurs commandes.`)) return;
    void run(() => api.admin.remove(creds, "sources", s.id));
  }

  return (
    <Panel title="Forages">
      <form onSubmit={save} className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="Nom du forage">
          <input className="field" placeholder="Forage Nord" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
        </Field>
        <Field label="Cité">
          <select className="field" value={form.cite_id} onChange={(e) => setForm({ ...form, cite_id: e.target.value })} required>
            <option value="">— Choisir —</option>
            {data.cites.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Latitude (facultatif)">
          <input className="field" inputMode="decimal" placeholder="5.3861" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
        </Field>
        <Field label="Longitude (facultatif)">
          <input className="field" inputMode="decimal" placeholder="-4.2712" value={form.long} onChange={(e) => setForm({ ...form, long: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Btn type="submit" variant="ink" disabled={busy}>
            {editing ? "Enregistrer" : "Ajouter"}
          </Btn>
          <Btn type="button" variant="white" onClick={useMyPosition}>
            <Icon name="pin" size={18} className="text-azur" /> Ma position actuelle
          </Btn>
          {editing && (
            <Btn type="button" variant="white" onClick={reset}>
              Annuler
            </Btn>
          )}
        </div>
        <p className="text-sm font-medium text-ink/55 sm:col-span-2">Les coordonnées placent le forage et ses tricycles sur la carte du dashboard.</p>
      </form>
      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <ul className="space-y-3">
        <AnimatePresence>
          {data.sources.map((s) => (
            <Row
              key={s.id}
              actions={
                <>
                  <SmallBtn
                    onClick={() => {
                      setEditing(s);
                      setForm({ nom: s.nom, cite_id: s.cite_id, lat: s.lat?.toString() ?? "", long: s.long?.toString() ?? "" });
                    }}
                  >
                    Modifier
                  </SmallBtn>
                  <SmallBtn danger onClick={() => remove(s)}>
                    Supprimer
                  </SmallBtn>
                </>
              }
            >
              <p className="text-lg font-bold">{s.nom}</p>
              <p className="text-sm text-ink/55">
                {citeNom(s.cite_id)} · {data.tricycles.filter((t) => t.source_id === s.id).length} chauffeur(s)
                {s.lat != null ? ` · ${s.lat.toFixed(4)}, ${s.long?.toFixed(4)}` : " · sans GPS"}
              </p>
            </Row>
          ))}
        </AnimatePresence>
        {data.sources.length === 0 && <p className="font-semibold text-ink/60">Aucun forage.</p>}
      </ul>
    </Panel>
  );
}
