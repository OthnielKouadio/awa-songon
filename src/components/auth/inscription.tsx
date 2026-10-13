"use client";

import { Icon } from "@/components/icons";
import { LinkBtn } from "@/components/ui";

/** Raison précise d'un téléphone refusé, ou null s'il est valide. */
export function erreurTelephone(tel: string): string | null {
  if (tel.length !== 10) return "Le numéro doit faire exactement 10 chiffres.";
  if (!/^(01|05|07|21|25|27)/.test(tel)) return "Numéro ivoirien invalide : il doit commencer par 01, 05, 07, 21, 25 ou 27.";
  return null;
}

/** Le compte EST créé, seule la connexion automatique a échoué : on le dit
 *  clairement, sans laisser croire à une erreur d'inscription. */
export function CompteCree({ raison }: { raison: string }) {
  return (
    <div role="status" className="rounded-2xl border-brut border-azur bg-sky p-4">
      <p className="flex items-center gap-2 font-bold text-ink">
        <Icon name="check" size={18} className="text-azur" /> Ton compte est bien créé.
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink/70">La connexion automatique n&apos;a pas marché ({raison}) Connecte-toi avec ton numéro et ton code PIN.</p>
      <LinkBtn href="/login" variant="ink" className="mt-4 w-full">
        Me connecter <Icon name="arrow" size={18} />
      </LinkBtn>
    </div>
  );
}
