"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Badge, Logo, Spinner } from "@/components/ui";
import { HOME } from "@/lib/session";
import type { Role } from "@/lib/types";

const CARDS: { role: "client" | "chauffeur"; icon: IconName; title: string; text: string }[] = [
  { role: "client", icon: "home", title: "Je suis Client", text: "Commande de l'eau pour ton lot, livrée par tricycle." },
  { role: "chauffeur", icon: "truck", title: "Je suis Chauffeur", text: "Gère ta file d'attente et tes livraisons." },
];

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

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

  if (checking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-10 flex justify-center">
        <Logo href="/" />
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <Badge tone="sky">Songon</Badge>
        <h1 className="title-xl mt-4 !text-4xl sm:!text-5xl">L&apos;eau potable à Songon</h1>
        <p className="mt-4 font-medium text-ink/60">Commande ton eau, un chauffeur te la livre par tricycle jusqu&apos;à ton lot.</p>
      </motion.div>

      <div className="mt-10 space-y-4">
        {CARDS.map((c, i) => (
          <motion.div key={c.role} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, type: "spring", stiffness: 220, damping: 24 }}>
            <Link href={`/inscription?role=${c.role}`} className="brut flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-sky">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-azur text-white">
                <Icon name={c.icon} size={28} />
              </span>
              <span>
                <span className="block font-display text-xl font-bold uppercase tracking-tight">{c.title}</span>
                <span className="mt-0.5 block text-sm font-medium text-ink/60">{c.text}</span>
              </span>
              <Icon name="arrow" size={22} className="ml-auto shrink-0 text-azur" />
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-azur">
          J&apos;ai déjà un compte <Icon name="arrow" size={16} />
        </Link>
      </div>
    </main>
  );
}
