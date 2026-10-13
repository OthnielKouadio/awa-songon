"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/data-provider";
import { errorMessage } from "@/lib/errors";
import { formatFcfa, onlyDigits, QUANTITE_L } from "@/lib/format";
import { phoneCI } from "@/lib/phone";
import type { Creds } from "@/lib/types";
import { CustomSelect } from "./CustomSelect";
import { Btn, CiteBadge, CloseButton, ErrorBox, Field, Modal, PhoneInput } from "./ui";

const AUTRE = "__autre__";

/** Saisie directe d'une commande par le chauffeur (appel téléphonique, client sur place).
 *  La commande entre directement dans sa file ; un client inconnu est créé en temporaire. */
export default function ManualOrderModal({
  open,
  creds,
  citeNom,
  prix,
  onClose,
  onCreated,
}: {
  open: boolean;
  creds: Creds;
  citeNom: string;
  prix: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [lots, setLots] = useState<string[]>([]);
  const [lot, setLot] = useState("");
  const [lotLibre, setLotLibre] = useState("");
  const [quantite, setQuantite] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNom("");
    setTel("");
    setLot("");
    setLotLibre("");
    setQuantite("");
    setNote("");
    setError("");
    api.chauffeurLots(creds).then(setLots).catch(() => setLots([]));
  }, [open, creds]);

  const lotFinal = lot === AUTRE || lots.length === 0 ? lotLibre.trim() : lot;
  const telOk = phoneCI(tel) !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nom.trim()) return setError("Entre le nom complet du client.");
    if (!telOk) return setError("Numéro ivoirien invalide (10 chiffres, commençant par 01, 05, 07, 21, 25 ou 27).");
    if (!lotFinal) return setError("Choisis le quartier / secteur.");
    const q = quantite ? Number(quantite) : null;
    if (q != null && (q < 1 || q > 200)) return setError("Quantité invalide (de 1 à 200 bidons).");
    setBusy(true);
    try {
      await api.chauffeurCommandeManuelle(creds, { nom, tel, lot: lotFinal, quantiteBidons: q, note });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label !mb-1">Saisie directe</p>
            <h3 className="title-md">Nouvelle commande</h3>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <Field label="Nom complet">
          <input className="field" autoComplete="off" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
        </Field>

        <Field label="Téléphone" hint={tel && !telOk ? "10 chiffres, commençant par 01, 05, 07, 21, 25 ou 27." : undefined}>
          <PhoneInput value={tel} onChange={setTel} autoComplete="off" invalid={!!tel && !telOk} />
        </Field>

        <Field label="Quartier / Secteur">
          <div className="space-y-2">
            <CiteBadge>{citeNom}</CiteBadge>
            {lots.length > 0 && (
              <CustomSelect
                ariaLabel="Quartier / Secteur"
                value={lot}
                onChange={setLot}
                placeholder="Choisir le lot"
                options={[...lots.map((l) => ({ value: l, label: `Lot ${l}` })), { value: AUTRE, label: "Autre lot" }]}
              />
            )}
            {(lot === AUTRE || lots.length === 0) && (
              <input className="field" inputMode="numeric" pattern="[0-9]*" placeholder="Numéro de lot" value={lotLibre} onChange={(e) => setLotLibre(onlyDigits(e.target.value, 10))} />
            )}
          </div>
        </Field>

        <Field label="Quantité (bidons)" hint={`Facultatif. Prix appliqué : ${formatFcfa(prix)} pour ${QUANTITE_L} L.`}>
          <input className="field" inputMode="numeric" pattern="[0-9]*" placeholder="—" value={quantite} onChange={(e) => setQuantite(onlyDigits(e.target.value, 3))} />
        </Field>

        <Field label="Note (facultatif)">
          <textarea className="field min-h-[84px] resize-none" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && <ErrorBox>{error}</ErrorBox>}

        <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy}>
          {busy ? "Enregistrement…" : "Ajouter à ma file"}
        </Btn>
      </form>
    </Modal>
  );
}
