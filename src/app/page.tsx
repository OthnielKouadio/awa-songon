"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { LegalLinks } from "@/components/LegalLinks";
import { Badge, Btn, ErrorBox, Logo } from "@/components/ui";
import { rpc } from "@/lib/api";
import { QR_VALIDE, normaliserQr, tousLesAppareils, type AppareilLocal } from "@/lib/appareils";
import { BONUS_FIDELITE_POINTS, SEUIL_FIDELITE, dateCourte, fcfa, points } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

type Infos = { telephone_service: string | null; essai_fin: string | null; cout_commande_points: number; cout_livreur_points: number };

/** Vitrine (V2) : hero, étapes, section chauffeur, tarifs, FAQ — adaptée aux QR de maison. */
export default function LandingPage() {
  const [infos, setInfos] = useState<Infos | null>(null);
  const [maisons, setMaisons] = useState<(AppareilLocal & { qr: string })[]>([]);

  useEffect(() => {
    setMaisons(tousLesAppareils());
    rpc<Infos>("public_infos").then(setInfos).catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6">
      <Header />
      {maisons.length > 0 && <MesMaisons maisons={maisons} />}
      <Hero />
      <CommentCaMarche />
      <OuvrirParCode />
      <SectionChauffeur infos={infos} />
      <Tarifs infos={infos} />
      <Faq infos={infos} />
      <Footer infos={infos} />
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-3">
      <Logo href="/" />
      <div className="flex items-center gap-2">
        <Link href="/login" className="rounded-xl border-brut border-ink bg-white px-3 py-2 text-sm font-bold transition-colors hover:bg-sky">
          Se connecter
        </Link>
        <Link href="/inscription">
          <Btn className="!px-3 !py-2 text-sm">S&apos;inscrire</Btn>
        </Link>
      </div>
    </header>
  );
}

/** Maisons déjà ouvertes sur ce téléphone : accès direct. */
function MesMaisons({ maisons }: { maisons: (AppareilLocal & { qr: string })[] }) {
  return (
    <section className="mt-8 space-y-2">
      <h2 className="label">Mes maisons</h2>
      {maisons.map((m) => (
        <Link key={m.qr} href={`/m/${m.qr}`} className="flex items-center justify-between rounded-brut border-brut border-ink bg-white p-4 shadow-hard-sm transition-colors hover:bg-sky">
          <span className="font-display text-2xl font-bold">{m.code_affichage}</span>
          <span className="flex items-center gap-1 font-bold text-azur">
            Commander <Icon name="arrow" size={18} />
          </span>
        </Link>
      ))}
    </section>
  );
}

function Hero() {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-10 text-center">
      <Badge tone="sky">Service disponible 7j/7 dans votre cité</Badge>
      <h1 className="title-xl mt-4 !text-4xl sm:!text-5xl">Fini la corvée d&apos;eau. On vous livre à domicile.</h1>
      <p className="mt-4 font-medium text-ink/60">
        Scannez le QR code collé sur votre portail et commandez votre eau en 30 secondes. Un livreur de votre cité vous livre directement à votre maison.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/inscription">
          <Btn variant="ink" size="lg" className="w-full sm:w-auto">
            <Icon name="drop" size={20} /> Commander mon eau
          </Btn>
        </Link>
        <Link href="/login">
          <Btn variant="white" size="lg" className="w-full sm:w-auto">
            Déjà inscrit ? Se connecter
          </Btn>
        </Link>
      </div>
    </motion.section>
  );
}

const ETAPES = [
  { n: 1, titre: "Scannez votre maison", texte: "Le QR code de votre portail (ex. PROMO 012). Le 1er de la famille crée le foyer." },
  { n: 2, titre: "Commandez", texte: "Aujourd'hui ou demain, avec le code maison à 4 chiffres de la famille." },
  { n: 3, titre: "Recevez", texte: "Suivi en temps réel, livraison à votre maison même si vous commandez d'ailleurs." },
];

function CommentCaMarche() {
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">3 étapes pour être livré</h2>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {ETAPES.map((e, i) => (
          <motion.div key={e.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="brut p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-white">{e.n}</span>
            <p className="title-md mt-3 !text-lg">{e.titre}</p>
            <p className="mt-1.5 text-sm font-medium text-ink/60">{e.texte}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** QR abîmé : le code en petit sous le QR suffit. */
function OuvrirParCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const qr = normaliserQr(code);
        if (!QR_VALIDE.test(qr)) return setErr("Le code fait 6 caractères (lettres et chiffres), écrit en petit sous le QR.");
        router.push(`/m/${qr}`);
      }}
      className="mt-10 space-y-3 rounded-brut border-brut border-ink bg-white p-5"
    >
      <h2 className="font-bold">Le QR ne passe pas ?</h2>
      <p className="text-sm text-ink/65">Tapez le code écrit en tout petit sous le QR (après « /m/ »).</p>
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
  );
}

function SectionChauffeur({ infos }: { infos: Infos | null }) {
  const cout = infos?.cout_livreur_points ?? 50;
  const citernes = Math.round(SEUIL_FIDELITE / cout);
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">
        Chauffeurs, augmentez vos revenus avec <span className="text-azur">Distribution Eau</span>
      </h2>
      <div className="mt-7 space-y-5">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="brut !bg-azur p-6 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <Icon name="drop" size={24} />
          </span>
          <p className="title-md mt-4 !text-xl text-white">{infos?.essai_fin ? `Essai gratuit jusqu'au ${dateCourte(infos.essai_fin)}` : "Essai gratuit au lancement"}</p>
          <p className="mt-2 font-medium text-white/85">
            Pendant l&apos;essai, <strong>livraisons illimitées, aucune commission.</strong> Vous testez, vous encaissez, vous êtes convaincu. Ensuite, vous
            rechargez vos points : 1 point = 1 franc, 1 livraison = {cout} points.
          </p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.06 }} className="brut p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky text-azur">
            <Icon name="phone" size={24} />
          </span>
          <p className="title-md mt-4 !text-xl">Recharge simple par Wave</p>
          <p className="mt-2 font-medium text-ink/60">Rechargez vos points par Wave. Compte réactivé dès la recharge enregistrée. Pas de dette.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.12 }} className="brut p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky text-azur">
            <Icon name="shield" size={24} />
          </span>
          <p className="title-md mt-4 !text-xl">Programme fidélité — livraisons gratuites à vie</p>
          <p className="mt-2 font-medium text-ink/60">
            Dès que vous cumulez {points(SEUIL_FIDELITE)} utilisés ({citernes} citernes livrées), on vous offre {points(BONUS_FIDELITE_POINTS)} = 1 livraison
            offerte. Automatique, sans limite.
          </p>
          <ul className="mt-3 space-y-1 text-sm font-bold text-ink">
            <li>{citernes} livraisons = 1 gratuite</li>
            <li>{citernes * 2} livraisons = 2 gratuites</li>
            <li className="text-ink/50">etc.</li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

function Tarifs({ infos }: { infos: Infos | null }) {
  const essai = infos?.essai_fin ? `Gratuit jusqu'au ${dateCourte(infos.essai_fin)}, puis ` : "";
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">Tarifs</h2>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <div className="brut-sm border-brut p-5">
          <Badge tone="sky">Famille</Badge>
          <p className="mt-3 font-bold">
            {essai}
            {fcfa(infos?.cout_commande_points ?? 100)} de service par commande. L&apos;eau est payée au livreur, à son prix.
          </p>
          <p className="mt-2 text-xs text-ink/50">Recharges non remboursables (crédits de livraison).</p>
        </div>
        <div className="brut-sm border-brut p-5">
          <Badge tone="sky">Chauffeur</Badge>
          <p className="mt-3 font-bold">
            {essai}
            {fcfa(infos?.cout_livreur_points ?? 50)} par livraison.
          </p>
        </div>
      </div>
    </section>
  );
}

function Faq({ infos }: { infos: Infos | null }) {
  const items = [
    { q: "Je commande depuis mon travail : où est-ce livré ?", r: "Toujours à votre maison (le code sur l'autocollant), jamais là où vous êtes." },
    { q: "Toute la famille peut commander ?", r: "Oui : un seul compte par maison. Chacun ouvre la maison sur son téléphone avec le code maison à 4 chiffres." },
    { q: "Je déménage, que deviennent mes points ?", r: "Les points sont des crédits de livraison non remboursables : utilisez-les avant votre départ." },
    {
      q: "Que se passe-t-il après l'essai gratuit ?",
      r: "Vous rechargez vos points par Wave pour continuer. Sans recharge, un chauffeur n'apparaît plus aux clients jusqu'à la prochaine recharge.",
    },
    {
      q: `Le bonus des ${points(SEUIL_FIDELITE)} est automatique ?`,
      r: `Oui, dès que vous atteignez ${points(SEUIL_FIDELITE)} utilisés, ${points(BONUS_FIDELITE_POINTS)} sont ajoutés automatiquement.`,
    },
  ];
  void infos;
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">Questions fréquentes</h2>
      <div className="mt-7 space-y-4">
        {items.map((f) => (
          <div key={f.q} className="brut-sm border-brut p-5">
            <p className="font-bold">{f.q}</p>
            <p className="mt-1.5 text-sm font-medium text-ink/60">{f.r}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer({ infos }: { infos: Infos | null }) {
  return (
    <footer className="mt-16 pb-4 text-center">
      <div className="flex justify-center">
        <Logo href="/" />
      </div>
      <p className="mt-3 font-medium text-ink/60">Distribution Eau — La solution d&apos;eau potable à domicile</p>
      {infos?.telephone_service && <p className="mt-1.5 text-sm font-bold text-ink/50">Contact : {formatPhone(infos.telephone_service)}</p>}
      <Link href="/inscription" className="mt-6 inline-block">
        <Btn variant="ink" size="lg">
          <Icon name="drop" size={20} /> Commander mon eau maintenant
        </Btn>
      </Link>
      <LegalLinks className="mt-8" />
    </footer>
  );
}
