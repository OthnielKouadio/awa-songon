"use client";

import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { api } from "@/lib/api";
import type { AdminData, Cite, Creds } from "@/lib/types";
import { useConfirm } from "../CustomModal";
import { Btn, ErrorBox, Field } from "../ui";
import { Panel, Row, SmallBtn, useMutation } from "./shared";

export default function CitesPanel({ creds, data, reload }: { creds: Creds; data: AdminData; reload: () => Promise<void> }) {
  const { run, busy, error, setError } = useMutation(reload);
  const { confirm, ConfirmDialog } = useConfirm();
  const [editing, setEditing] = useState<Cite | null>(null);
  const [nom, setNom] = useState("");

  function reset() {
    setEditing(null);
    setNom("");
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = nom.trim();
    if (!value) return;
    if (await run(() => api.admin.save(creds, "cites", editing?.id ?? null, { nom: value }))) reset();
  }

  async function remove(c: Cite) {
    const nbSources = data.sources.filter((s) => s.cite_id === c.id).length;
    const ok = await confirm(`Cela supprime aussi ses ${nbSources} source(s), leurs chauffeurs, ses clients et toutes les commandes liées.`, {
      title: `Supprimer « ${c.nom} » ?`,
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    void run(() => api.admin.remove(creds, "cites", c.id));
  }

  return (
    <Panel title="Cités">
      <form onSubmit={save} className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Field label={editing ? `Renommer « ${editing.nom} »` : "Nouvelle cité"}>
            <input className="field" placeholder="Cité 4" value={nom} onChange={(e) => setNom(e.target.value)} />
          </Field>
        </div>
        <Btn type="submit" variant="ink" disabled={busy || !nom.trim()}>
          {editing ? "Enregistrer" : "Ajouter"}
        </Btn>
        {editing && (
          <Btn type="button" variant="white" onClick={reset}>
            Annuler
          </Btn>
        )}
      </form>
      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <ul className="space-y-3">
        <AnimatePresence>
          {data.cites.map((c) => (
            <Row
              key={c.id}
              actions={
                <>
                  <SmallBtn
                    onClick={() => {
                      setEditing(c);
                      setNom(c.nom);
                    }}
                  >
                    Modifier
                  </SmallBtn>
                  <SmallBtn danger onClick={() => remove(c)}>
                    Supprimer
                  </SmallBtn>
                </>
              }
            >
              <p className="text-lg font-bold">{c.nom}</p>
              <p className="text-sm text-ink/55">
                {data.sources.filter((s) => s.cite_id === c.id).length} source(s) · {data.clients.filter((cl) => cl.cite_id === c.id).length} client(s)
              </p>
            </Row>
          ))}
        </AnimatePresence>
        {data.cites.length === 0 && <p className="font-semibold text-ink/60">Aucune cité. Crée la première ci-dessus.</p>}
      </ul>
      {ConfirmDialog}
    </Panel>
  );
}
