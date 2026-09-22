"use client";

import { useEffect, useState } from "react";
import GeoPrompt from "@/components/GeoPrompt";
import { Icon } from "@/components/icons";
import { CustomSelect } from "@/components/CustomSelect";
import { Btn, ErrorBox, Field, PinInput } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { byNom, normalizePhone } from "@/lib/format";
import { saveSession } from "@/lib/session";
import type { Cite, Role } from "@/lib/types";
import { useGeo } from "@/lib/useGeo";

/** Formulaire d'inscription client — utilisé sur /login (onglet Inscription)
 *  et sur /inscription?role=client. Cité choisie via CustomSelect uniquement
 *  (jamais un <select> natif). */
export default function ClientSignupForm({ onSession }: { onSession: (role: Role) => void }) {
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [citeId, setCiteId] = useState("");
  const [lot, setLot] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [cites, setCites] = useState<Cite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const geo = useGeo();

  useEffect(() => {
    api
      .fetchCites()
      .then((c) => setCites([...c].sort(byNom)))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 4) return setError("Ton code doit faire 4 chiffres.");
    if (pin !== pin2) return setError("Les deux codes ne sont pas identiques.");
    if (!citeId) return setError("Choisis ta cité.");
    if (!lot.trim()) return setError("Entre ton numéro de lot.");
    setBusy(true);
    try {
      const s = await api.inscrireClient({
        nom,
        tel: normalizePhone(tel),
        citeId,
        lot,
        pin,
        gps: geo.coords ? { lat: geo.coords.lat, long: geo.coords.lng } : null,
      });
      saveSession(s.creds);
      onSession("client");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="brut space-y-5 p-5">
        <Field label="Ton nom">
          <input className="field" placeholder="Fatou" autoComplete="name" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
        </Field>

        <Field label="Ton numéro de téléphone">
          <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={tel} onChange={(e) => setTel(e.target.value)} required />
        </Field>

        <Field label="Ta cité">
          <CustomSelect
            ariaLabel="Ta cité"
            value={citeId}
            onChange={setCiteId}
            placeholder="— Choisir ma cité —"
            options={cites.map((c) => ({ value: c.id, label: c.nom }))}
          />
        </Field>

        <Field label="Ton numéro de lot">
          <input className="field" placeholder="Ex : 45" maxLength={20} value={lot} onChange={(e) => setLot(e.target.value)} required />
        </Field>

        <Field label="Crée ton code PIN (4 chiffres)" hint="Retiens-le : c'est lui qui protège ton compte.">
          <PinInput value={pin} onChange={setPin} autoComplete="new-password" />
        </Field>
        <Field label="Confirme ton code">
          <PinInput value={pin2} onChange={setPin2} autoComplete="new-password" />
        </Field>

        {error && <ErrorBox>{error}</ErrorBox>}

        <Btn type="submit" variant="ink" size="lg" className="w-full" disabled={busy || !tel.trim() || pin.length !== 4}>
          {busy ? "Un instant…" : "Créer mon compte"} {!busy && <Icon name="arrow" size={20} />}
        </Btn>
      </form>

      <GeoPrompt open={geo.shouldPrompt} onAccept={geo.request} onDismiss={geo.dismissPrompt} />
    </>
  );
}
