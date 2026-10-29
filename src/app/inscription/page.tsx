"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { Btn, ErrorBox, Logo } from "@/components/ui";
import { QR_VALIDE, normaliserQr } from "@/lib/appareils";

/**
 * Inscription d'une maison. Volontairement PAS de formulaire « numéro de
 * maison libre » : n'importe qui pourrait inscrire la maison d'un voisin à
 * distance (PROMO 001, 002…). On passe par le QR du portail (ou le code
 * imprimé dessous), que seul quelqu'un devant la porte peut lire.
 */
export default function InscriptionPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-8">
        <Logo href="/" />
      </header>
      <h1 className="title-lg">Inscrire ma maison</h1>
      <p className="mt-2 text-lg text-ink/70">Chaque maison de la cité a un autocollant avec un QR code sur son portail.</p>

      <ol className="mt-6 space-y-3">
        {[
          { i: "home", t: "Va devant ton portail", d: "Trouve l'autocollant (ex. PROMO 012)." },
          { i: "eye", t: "Scanne le QR code", d: "Avec l'appareil photo de ton téléphone." },
          { i: "users", t: "Crée ton foyer", d: "Nom de famille, numéro et code maison à 4 chiffres pour toute la famille." },
        ].map((e, n) => (
          <li key={e.t} className="flex gap-4 rounded-brut border-brut border-ink bg-mist p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azur font-display text-lg font-bold text-white">{n + 1}</span>
            <div>
              <p className="flex items-center gap-2 text-lg font-bold">
                <Icon name={e.i as "home"} size={18} className="text-azur" /> {e.t}
              </p>
              <p className="text-ink/70">{e.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const qr = normaliserQr(code);
          if (!QR_VALIDE.test(qr)) return setErr("Le code fait 6 caractères (lettres et chiffres), écrit en petit sous le QR.");
          router.push(`/m/${qr}`);
        }}
        className="mt-8 space-y-3 rounded-brut border-brut border-ink bg-white p-5"
      >
        <h2 className="font-bold">Le QR ne passe pas ?</h2>
        <p className="text-sm text-ink/65">Tape le code écrit en tout petit sous le QR (après « /m/ »).</p>
        <input
          className="field text-center font-display !text-2xl font-bold uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="K7QX2P"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Code de la maison"
        />
        {err && <ErrorBox>{err}</ErrorBox>}
        <Btn type="submit" size="lg" className="w-full">
          Ouvrir ma maison
        </Btn>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        Pas d&apos;autocollant sur ta maison ? Appelle le service, on vient le poser. Déjà inscrit ?{" "}
        <Link href="/login" className="font-bold text-azur underline">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
