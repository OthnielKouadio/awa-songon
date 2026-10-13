"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ChauffeurSignupForm from "@/components/auth/ChauffeurSignupForm";
import { Icon } from "@/components/icons";
import { Badge, Logo } from "@/components/ui";
import { openSession } from "@/lib/session";
import type { Creds } from "@/lib/types";

/** Inscription chauffeur, servie UNIQUEMENT par le lien privé /<DRIVER_SIGNUP_PATH>
 *  que l'admin envoie au chauffeur recruté (/recrutement-chauffeur → 404). */
export default function RecrutementChauffeurPage() {
  const router = useRouter();

  async function onSession(creds: Creds) {
    router.push(await openSession(creds));
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8 flex justify-center">
        <Logo href="/" />
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Badge tone="sky">Espace chauffeur</Badge>
        <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">Crée ton compte chauffeur</h1>

        <div className="mt-6">
          <ChauffeurSignupForm onSession={onSession} />
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
