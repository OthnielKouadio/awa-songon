"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { CustomSelect } from "@/components/CustomSelect";
import { Btn, ErrorBox, Field, PhoneInput, PinInput } from "@/components/ui";
import { api } from "@/lib/data-provider";
import { errorMessage, MESSAGES } from "@/lib/errors";
import { pinTropSimple } from "@/lib/pin";
import { byNom, onlyDigits, PRIX_DEFAUT, PRIX_MAX, PRIX_MIN, QUANTITE_L } from "@/lib/format";
import { phoneCI } from "@/lib/phone";
import { CompteCree, erreurTelephone } from "./inscription";
import type { Cite, Creds, Source } from "@/lib/types";

/** Formulaire d'inscription chauffeur — utilisé uniquement sur le lien de
 *  recrutement privé (src/app/recrutement-chauffeur). Jamais de <select> natif :
 *  - « Ta cité » (CustomSelect, obligatoire, UNE seule, définitive : il ne
 *    livrera que les clients de cette cité) ;
 *  - « Ta source » (CustomSelect, FACULTATIVE — un chauffeur qui n'en choisit
 *    pas puise un peu partout), limitée aux forages de sa cité. */
export default function ChauffeurSignupForm({ onSession }: { onSession: (creds: Creds) => Promise<void> }) {
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [citeId, setCiteId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [prix, setPrix] = useState(String(PRIX_DEFAUT));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [cites, setCites] = useState<Cite[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cree, setCree] = useState<string | null>(null); // compte créé, connexion auto échouée

  useEffect(() => {
    Promise.all([api.fetchCites(), api.fetchSources()])
      .then(([c, s]) => {
        setCites([...c].sort(byNom));
        setSources([...s].sort(byNom));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function chooseCite(v: string) {
    setCiteId(v);
    // la source doit appartenir à la cité choisie : on l'efface si elle n'en fait plus partie.
    setSourceId((prev) => (sources.find((x) => x.id === prev)?.cite_id === v ? prev : ""));
  }

  const sourcesDeLaCite = sources.filter((s) => s.cite_id === citeId);

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
    const p = Number(prix);
    if (!Number.isFinite(p) || p < PRIX_MIN || p > PRIX_MAX) return setError("Entre un prix valide (de 100 à 50 000 FCFA).");
    setBusy(true);
    // 1) Création du compte : ses erreurs (numéro déjà inscrit, cité…) s'affichent telles quelles.
    let s;
    try {
      s = await api.inscrireChauffeur({ nom, tel: telCI, citeId, sourceId: sourceId || null, pin, prix: p });
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
    <form onSubmit={submit} className="brut space-y-5 p-5">
      <Field label="Ton nom">
        <input className="field" placeholder="Kader" autoComplete="name" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
      </Field>

      <Field label="Ton numéro de téléphone">
        <PhoneInput value={tel} onChange={setTel} />
      </Field>

      <Field label="Ta cité" hint="Une seule, et elle ne pourra plus être changée : tu livreras uniquement les clients de cette cité.">
        <CustomSelect
          ariaLabel="Ta cité"
          value={citeId}
          onChange={chooseCite}
          placeholder="— Choisir ma cité —"
          options={cites.map((c) => ({ value: c.id, label: c.nom }))}
        />
      </Field>

      <Field label="Ta source (facultatif)" hint={!citeId ? "Choisis d'abord ta cité." : "Si tu ne puises pas toujours au même endroit, laisse vide."}>
        <CustomSelect
          ariaLabel="Ta source"
          value={sourceId}
          onChange={setSourceId}
          placeholder={!citeId ? "— Choisis d'abord ta cité —" : "— Aucune source fixe —"}
          disabled={!citeId}
          options={sourcesDeLaCite.map((s) => ({ value: s.id, label: s.nom }))}
        />
      </Field>

      <Field label={`Ton prix pour ${QUANTITE_L}L (FCFA)`} hint="C'est le prix que les clients verront. Tu pourras le changer plus tard.">
        <input className="field" inputMode="numeric" pattern="[0-9]*" placeholder="2500" value={prix} onChange={(e) => setPrix(onlyDigits(e.target.value, 5))} required />
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
  );
}
