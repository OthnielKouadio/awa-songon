"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ClientSignupForm from "@/components/auth/ClientSignupForm";
import { Icon } from "@/components/icons";
import { Badge, Logo } from "@/components/ui";
import { openSession } from "@/lib/session";
import type { Creds } from "@/lib/types";

/** Inscription publique : clients uniquement. Les chauffeurs s'inscrivent par le
 *  lien de recrutement privé que l'admin leur envoie (DRIVER_SIGNUP_PATH). */
export default function InscriptionPage() {
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
        <Badge tone="sky">Espace client</Badge>
        <h1 className="title-lg mt-4 !text-3xl sm:!text-4xl">Crée ton compte client</h1>

        <div className="mt-6">
          <ClientSignupForm onSession={onSession} />
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
