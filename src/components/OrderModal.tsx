"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { estimerMinutes, formatFcfa, formatMinutes, QUANTITE_L } from "@/lib/format";
import type { Creds, TricycleDispo } from "@/lib/types";
import type { Coords } from "@/lib/useGeo";
import { Icon } from "./icons";
import { Btn, CloseButton, ErrorBox, Modal } from "./ui";

/** Confirmation de commande : cité, lot et téléphone viennent du compte connecté
 *  — il ne reste qu'à choisir le tricycle et confirmer (1000 L, prix du chauffeur). */
export default function OrderModal({
  tricycle,
  creds,
  coords,
  onClose,
  onOrdered,
}: {
  tricycle: TricycleDispo | null;
  creds: Creds;
  coords: Coords | null;
  onClose: () => void;
  onOrdered: (commandeId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tricycle) setError("");
  }, [tricycle]);

  async function submit() {
    if (!tricycle) return;
    setBusy(true);
    setError("");
    try {
      const id = await api.creerCommande({ tricycleId: tricycle.id, gps: coords ? { lat: coords.lat, long: coords.lng } : null }, creds);
      onOrdered(id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const position = (tricycle?.file_count ?? 0) + 1;

  return (
    <Modal open={!!tricycle} onClose={busy ? () => {} : onClose}>
      {tricycle && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label !mb-1">Ta commande</p>
              <h3 className="title-md">Tricycle de {tricycle.nom}</h3>
              <p className="mt-1 font-medium text-ink/60">{tricycle.source_nom}</p>
            </div>
            <CloseButton onClick={onClose} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border-brut border-ink bg-white p-4">
            <div>
              <p className="font-display text-3xl font-bold leading-none">{QUANTITE_L}L</p>
              <p className="mt-1 text-sm font-semibold text-ink/60">un voyage</p>
            </div>
            <p className="font-display text-3xl font-bold leading-none text-azur">{formatFcfa(tricycle.prix_1000)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-azur bg-sky px-3 py-1 text-azur">
              <Icon name="clock" size={14} /> N°{position} · ≈ {formatMinutes(estimerMinutes(position))}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 ${
                coords ? "border-azur bg-azur text-white" : "border-steel bg-white text-ink/60"
              }`}
            >
              <Icon name="pin" size={14} />
              {coords ? `GPS précis ±${coords.accuracy} m` : "Position du compte"}
            </span>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <Btn variant="ink" size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Envoi…" : `Commander ${QUANTITE_L}L`}
          </Btn>
        </div>
      )}
    </Modal>
  );
}
