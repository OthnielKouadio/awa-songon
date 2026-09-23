"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CustomModal } from "@/components/CustomModal";
import { Icon, type IconName } from "@/components/icons";
import { Badge, Btn, Logo, Spinner } from "@/components/ui";
import {
  BONUS_FIDELITE_POINTS,
  BONUS_INSCRIPTION,
  CITERNES_FIDELITE,
  formatFcfa,
  formatPoints,
  LIVRAISONS_ESSAI,
  NUMERO_RECHARGE,
  NUMERO_RECHARGE_2,
  POINTS_PAR_LIVRAISON,
  RECHARGE_MIN_FCFA,
  RECHARGE_MULTIPLE,
  SEUIL_FIDELITE,
} from "@/lib/format";
import { HOME } from "@/lib/session";
import type { Role } from "@/lib/types";

type RoleChoix = "client" | "chauffeur";
type PopupIntent = "login" | "signup" | null;

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [popup, setPopup] = useState<PopupIntent>(null);

  // Déjà connecté → direct sur son tableau de bord, pas la peine de revoir la vitrine.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem("awa:session:v4");
    } catch {}
    if (raw) {
      try {
        const c = JSON.parse(raw) as { role?: Role };
        if (c.role) {
          router.replace(HOME[c.role]);
          return;
        }
      } catch {}
    }
    setChecking(false);
  }, [router]);

  function choisirRole(role: RoleChoix) {
    router.push(popup === "login" ? `/login?role=${role}` : `/inscription?role=${role}`);
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6">
      <Header onLogin={() => setPopup("login")} onSignup={() => setPopup("signup")} />
      <Hero />
      <CommentCaMarche />
      <SectionChauffeur />
      <Tarifs />
      <Faq />
      <Footer />

      <CustomModal open={!!popup} onClose={() => setPopup(null)} title="Vous êtes Client ou Chauffeur ?">
        <div className="space-y-3">
          <RoleButton icon="home" title="Client" text="Je commande de l'eau pour mon lot." onClick={() => choisirRole("client")} />
          <RoleButton icon="truck" title="Chauffeur" text="Je livre et je gagne des points." onClick={() => choisirRole("chauffeur")} />
        </div>
      </CustomModal>
    </main>
  );
}

function RoleButton({ icon, title, text, onClick }: { icon: IconName; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl border-brut border-ink bg-white p-4 text-left transition-colors hover:bg-sky">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-azur text-white">
        <Icon name={icon} size={24} />
      </span>
      <span>
        <span className="block font-display text-lg font-bold uppercase tracking-tight">{title}</span>
        <span className="block text-sm font-medium text-ink/60">{text}</span>
      </span>
      <Icon name="arrow" size={20} className="ml-auto shrink-0 text-azur" />
    </button>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

function Header({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <Logo href="/" />
      <div className="flex items-center gap-2">
        <button onClick={onLogin} className="rounded-xl border-brut border-ink bg-white px-3 py-2 text-sm font-bold transition-colors hover:bg-sky">
          Se connecter
        </button>
        <Btn onClick={onSignup} className="!px-3 !py-2 text-sm">
          S&apos;inscrire
        </Btn>
      </div>
    </header>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-10 text-center">
      <Badge tone="sky">Service disponible 7j/7 à Songon</Badge>
      <h1 className="title-xl mt-4 !text-4xl sm:!text-5xl">Fini la corvée d&apos;eau. On vous livre à domicile.</h1>
      <p className="mt-4 font-medium text-ink/60">
        Commandez votre eau potable en 30 secondes. Un chauffeur de tricycle proche vous livre directement sur votre lot en moins d&apos;une heure.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/inscription?role=client">
          <Btn variant="ink" size="lg" className="w-full sm:w-auto">
            <Icon name="drop" size={20} /> Commander mon eau
          </Btn>
        </Link>
        <Link href="/inscription?role=chauffeur">
          <Btn variant="white" size="lg" className="w-full sm:w-auto">
            <Icon name="truck" size={20} /> Devenir chauffeur
          </Btn>
        </Link>
      </div>
    </motion.section>
  );
}

// ─── Comment ça marche (client) ─────────────────────────────────────────────

const ETAPES = [
  { n: 1, titre: "Inscrivez votre lot", texte: "Nom, téléphone, numéro de lot." },
  { n: 2, titre: "Commandez", texte: "Choisissez le nombre de citernes." },
  { n: 3, titre: "Recevez", texte: "Suivi en temps réel, livraison à domicile." },
];

function CommentCaMarche() {
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">3 étapes pour être livré</h2>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {ETAPES.map((e, i) => (
          <motion.div
            key={e.n}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="brut p-5"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-white">{e.n}</span>
            <p className="title-md mt-3 !text-lg">{e.titre}</p>
            <p className="mt-1.5 text-sm font-medium text-ink/60">{e.texte}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Section chauffeur (la plus importante) ─────────────────────────────────

function SectionChauffeur() {
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
          <p className="title-md mt-4 !text-xl text-white">1 mois d&apos;essai gratuit — {formatPoints(BONUS_INSCRIPTION)} offerts</p>
          <p className="mt-2 font-medium text-white/85">
            À l&apos;inscription, recevez {formatPoints(BONUS_INSCRIPTION)} GRATUITS. 1 point = 1 franc. 1 livraison = {POINTS_PAR_LIVRAISON} points.{" "}
            <strong>{formatPoints(BONUS_INSCRIPTION)} = {LIVRAISONS_ESSAI} livraisons 100% gratuites.</strong> Aucune commission pendant vos {LIVRAISONS_ESSAI} premières
            courses. Vous testez, vous encaissez, vous êtes convaincu. Après ça, vous rechargez.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.06 }} className="brut p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky text-azur">
            <Icon name="phone" size={24} />
          </span>
          <p className="title-md mt-4 !text-xl">Recharge simple par Wave</p>
          <p className="mt-2 font-medium text-ink/60">
            Rechargez vos points par Wave / OM. Minimum {formatFcfa(RECHARGE_MIN_FCFA)} ({RECHARGE_MIN_FCFA} points). Recharge multiple de {RECHARGE_MULTIPLE} obligatoire.
            Compte réactivé instantanément. Pas de dette.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.12 }} className="brut p-6">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky text-azur">
            <Icon name="shield" size={24} />
          </span>
          <p className="title-md mt-4 !text-xl">Programme fidélité — livraisons gratuites à vie</p>
          <p className="mt-2 font-medium text-ink/60">
            On récompense les bosseurs. Dès que vous cumulez {formatPoints(SEUIL_FIDELITE)} utilisés ({CITERNES_FIDELITE} citernes livrées), on vous offre{" "}
            {formatPoints(BONUS_FIDELITE_POINTS)} gratuits = 1 livraison offerte. Automatique, sans limite.
          </p>
          <ul className="mt-3 space-y-1 text-sm font-bold text-ink">
            <li>{CITERNES_FIDELITE} livraisons = 1 gratuite</li>
            <li>{CITERNES_FIDELITE * 2} livraisons = 2 gratuites</li>
            <li className="text-ink/50">etc.</li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Tarifs ─────────────────────────────────────────────────────────────────

function Tarifs() {
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">Tarifs</h2>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <div className="brut-sm border-brut p-5">
          <Badge tone="sky">Client</Badge>
          <p className="mt-3 font-bold">Prix de la citerne selon la zone, pas de frais d&apos;app.</p>
        </div>
        <div className="brut-sm border-brut p-5">
          <Badge tone="sky">Chauffeur</Badge>
          <p className="mt-3 font-bold">{formatFcfa(POINTS_PAR_LIVRAISON)} de commission par citerne, prélevé en points.</p>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: `Que se passe-t-il après mes ${formatPoints(BONUS_INSCRIPTION)} gratuits ?`,
    r: "Votre compte passe OFF. Il faut recharger pour recevoir à nouveau des commandes.",
  },
  {
    q: `Le bonus des ${formatPoints(SEUIL_FIDELITE)} est automatique ?`,
    r: `Oui, dès que vous atteignez ${formatPoints(SEUIL_FIDELITE)} utilisés, ${formatPoints(BONUS_FIDELITE_POINTS)} sont ajoutés automatiquement.`,
  },
];

function Faq() {
  return (
    <section className="mt-16">
      <h2 className="title-lg text-center !text-2xl sm:!text-3xl">Questions fréquentes</h2>
      <div className="mt-7 space-y-4">
        {FAQ_ITEMS.map((f) => (
          <div key={f.q} className="brut-sm border-brut p-5">
            <p className="font-bold">{f.q}</p>
            <p className="mt-1.5 text-sm font-medium text-ink/60">{f.r}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="mt-16 pb-4 text-center">
      <Logo href="/" />
      <p className="mt-3 font-medium text-ink/60">Distribution Eau — La solution d&apos;eau potable à domicile</p>
      <p className="mt-1.5 text-sm font-bold text-ink/50">
        Contact : {NUMERO_RECHARGE} · {NUMERO_RECHARGE_2}
      </p>
      <Link href="/inscription?role=client" className="mt-6 inline-block">
        <Btn variant="ink" size="lg">
          <Icon name="drop" size={20} /> Commander mon eau maintenant
        </Btn>
      </Link>
    </footer>
  );
}
