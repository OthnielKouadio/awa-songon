"use client";

import { useEffect, useState } from "react";
import GeoPrompt from "@/components/GeoPrompt";
import { Icon } from "@/components/icons";
import { CustomSelect } from "@/components/CustomSelect";
import { Btn, ErrorBox, Field, PhoneInput, PinInput } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { errorMessage, MESSAGES } from "@/lib/errors";
import { pinTropSimple } from "@/lib/pin";
import { byNom, onlyDigits } from "@/lib/format";
import { phoneCI } from "@/lib/phone";
import { CompteCree, erreurTelephone } from "./inscription";
import type { Cite, Creds } from "@/lib/types";
import { useGeo } from "@/lib/useGeo";

/** Formulaire d'inscription client — utilisé sur /inscription. Cité choisie via
 *  CustomSelect uniquement
 *  (jamais un <select> natif). */
export default function ClientSignupForm({ onSession }: { onSession: (creds: Creds) => Promise<void> }) {
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [citeId, setCiteId] = useState("");
  const [lot, setLot] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [cites, setCites] = useState<Cite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cree, setCree] = useState<string | null>(null); // compte créé, connexion auto échouée
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
    if (!nom.trim()) return setError("Entre ton nom.");
    const errTel = erreurTelephone(tel);
    const telCI = phoneCI(tel);
    if (errTel || !telCI) return setError(errTel ?? "Numéro de téléphone invalide.");
    if (pin.length !== 4) return setError("Ton code doit faire 4 chiffres.");
    if (pinTropSimple(pin)) return setError(MESSAGES.PIN_TROP_SIMPLE);
    if (pin !== pin2) return setError("Les deux codes ne sont pas identiques.");
    if (!citeId) return setError("Choisis ta cité.");
    if (!lot.trim()) return setError("Entre ton numéro de lot.");
    setBusy(true);
    // 1) Création du compte : ses erreurs (numéro déjà inscrit, cité…) s'affichent telles quelles.
    let s;
    try {
      s = await api.inscrireClient({
        nom,
        tel: telCI,
        citeId,
        lot,
        pin,
        gps: geo.coords ? { lat: geo.coords.lat, long: geo.coords.lng } : null,
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      return;
    }
    // 2) Connexion automatique : le compte existe déjà, un échec ici n'est pas un échec d'inscription.
    try {
      await onSession(s.creds);
    } catch (err) {
      setCree(errorMessage(err));
      setBusy(false);
    }
  }

  if (cree) return <CompteCree raison={cree} />;

  return (
    <>
      <form onSubmit={submit} className="brut space-y-5 p-5">
        <Field label="Ton nom">
          <input className="field" placeholder="Fatou" autoComplete="name" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
        </Field>

        <Field label="Ton numéro de téléphone">
          <PhoneInput value={tel} onChange={setTel} />
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
          <input className="field" inputMode="numeric" pattern="[0-9]*" placeholder="Ex : 45" value={lot} onChange={(e) => setLot(onlyDigits(e.target.value, 10))} required />
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
