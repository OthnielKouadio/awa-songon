"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { CustomSelect } from "@/components/CustomSelect";
import { CustomMultiSelect } from "@/components/CustomMultiSelect";
import { Btn, ErrorBox, Field, PinInput } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { byNom, normalizePhone, onlyDigits, PRIX_DEFAUT, PRIX_MAX, PRIX_MIN, QUANTITE_L } from "@/lib/format";
import { saveSession } from "@/lib/session";
import type { Cite, Role, Source } from "@/lib/types";

/** Formulaire d'inscription chauffeur — utilisé sur /login (onglet Inscription)
 *  et sur /inscription?role=chauffeur. Jamais de <select> natif :
 *  - « Tes cités » (CustomMultiSelect, obligatoire, plusieurs possibles — un
 *    chauffeur peut livrer plusieurs cités à la fois) ;
 *  - « Ta source » (CustomSelect, FACULTATIVE — un chauffeur qui n'en choisit
 *    pas puise un peu partout), groupée par cité dès qu'il y en a plusieurs. */
export default function ChauffeurSignupForm({ onSession }: { onSession: (role: Role) => void }) {
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [citeIds, setCiteIds] = useState<string[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [prix, setPrix] = useState(String(PRIX_DEFAUT));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [cites, setCites] = useState<Cite[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.fetchCites(), api.fetchSources()])
      .then(([c, s]) => {
        setCites([...c].sort(byNom));
        setSources([...s].sort(byNom));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function chooseCites(v: string[]) {
    setCiteIds(v);
    // la source doit appartenir à une des cités choisies : si elle n'en fait
    // plus partie après ce changement, on l'efface.
    setSourceId((prev) => {
      const s = sources.find((x) => x.id === prev);
      return s && v.includes(s.cite_id) ? prev : "";
    });
  }

  const sourcesDesCites = sources.filter((s) => citeIds.includes(s.cite_id));
  const citesChoisies = cites.filter((c) => citeIds.includes(c.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 4) return setError("Ton code doit faire 4 chiffres.");
    if (pin !== pin2) return setError("Les deux codes ne sont pas identiques.");
    if (citeIds.length === 0) return setError("Choisis au moins une cité.");
    const p = Number(prix);
    if (!Number.isFinite(p) || p < PRIX_MIN || p > PRIX_MAX) return setError("Entre un prix valide (de 100 à 50 000 FCFA).");
    setBusy(true);
    try {
      const s = await api.inscrireChauffeur({ nom, tel: normalizePhone(tel), citeIds, sourceId: sourceId || null, pin, prix: p });
      saveSession(s.creds);
      onSession("chauffeur");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="brut space-y-5 p-5">
      <Field label="Ton nom">
        <input className="field" placeholder="Kader" autoComplete="name" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} required />
      </Field>

      <Field label="Ton numéro de téléphone">
        <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={tel} onChange={(e) => setTel(e.target.value)} required />
      </Field>

      <Field label="Tes cités" hint="Tu peux en choisir plusieurs si tu livres à plusieurs endroits.">
        <CustomMultiSelect
          ariaLabel="Tes cités"
          values={citeIds}
          onChange={chooseCites}
          placeholder="— Choisir mes cités —"
          options={cites.map((c) => ({ value: c.id, label: c.nom }))}
        />
      </Field>

      <Field label="Ta source (facultatif)" hint={citeIds.length === 0 ? "Choisis d'abord au moins une cité." : "Si tu ne puises pas toujours au même endroit, laisse vide."}>
        <CustomSelect
          ariaLabel="Ta source"
          value={sourceId}
          onChange={setSourceId}
          placeholder={citeIds.length === 0 ? "— Choisis d'abord une cité —" : "— Aucune source fixe —"}
          disabled={citeIds.length === 0}
          groups={citesChoisies.map((c) => ({
            label: c.nom,
            options: sourcesDesCites.filter((s) => s.cite_id === c.id).map((s) => ({ value: s.id, label: s.nom })),
          }))}
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
