"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChauffeurSignupForm from "@/components/auth/ChauffeurSignupForm";
import ClientSignupForm from "@/components/auth/ClientSignupForm";
import { Icon } from "@/components/icons";
import { Badge, Logo, Spinner } from "@/components/ui";
import { HOME } from "@/lib/session";
import type { Role } from "@/lib/types";

const CONTENT: Record<"client" | "chauffeur", { badge: string; title: string }> = {
  client: { badge: "Espace client", title: "Crée ton compte client" },
  chauffeur: { badge: "Espace chauffeur", title: "Crée ton compte chauffeur" },
};

export default function InscriptionPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4"><Spinner /></main>}>
      <InscriptionContent />
    </Suspense>
  );
}

function InscriptionContent() {
  const router = useRouter();
  const params = useSearchParams();
  const role: "client" | "chauffeur" = params.get("role") === "chauffeur" ? "chauffeur" : "client";
  const c = CONTENT[role];

  function onSession(r: Role) {
    router.push(HOME[r]);
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8 flex justify-center">
        <Logo href="/" />
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Badge tone="sky">{c.badge}</Badge>
        <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">{c.title}</h1>

        <div className="mt-6">
          {role === "client" ? <ClientSignupForm onSession={onSession} /> : <ChauffeurSignupForm onSession={onSession} />}
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-azur">
            J&apos;ai déjà un compte <Icon name="arrow" size={16} />
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
