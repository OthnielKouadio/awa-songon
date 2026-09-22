"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ChauffeursPanel from "@/components/admin/ChauffeursPanel";
import CitesPanel from "@/components/admin/CitesPanel";
import ClientsPanel from "@/components/admin/ClientsPanel";
import CommandesPanel from "@/components/admin/CommandesPanel";
import AdminDashboard from "@/components/admin/Dashboard";
import SecuritePanel from "@/components/admin/SecuritePanel";
import SourcesPanel from "@/components/admin/SourcesPanel";
import { Badge, ErrorBox, Logo, PulseDot, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { AppError, errorMessage } from "@/lib/errors";
import { byNom } from "@/lib/format";
import { clearSession, readSession } from "@/lib/session";
import type { AdminData, Creds } from "@/lib/types";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "cites", label: "Cités" },
  { id: "sources", label: "Forages" },
  { id: "chauffeurs", label: "Chauffeurs" },
  { id: "clients", label: "Clients" },
  { id: "commandes", label: "Commandes" },
  { id: "securite", label: "Sécurité" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const router = useRouter();
  const [creds, setCreds] = useState<Creds | null | undefined>(undefined);

  useEffect(() => {
    const s = readSession();
    if (!s || s.role !== "admin") {
      router.replace("/login");
      return;
    }
    setCreds(s);
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    router.replace("/login");
  }, [router]);

  if (creds === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-4">
        <Spinner />
      </main>
    );
  }
  if (!creds) return null;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Logo href="/admin" />
        <div className="flex items-center gap-3">
          <Badge tone="ink">Super admin</Badge>
          <button onClick={logout} className="text-sm font-semibold text-ink/60 underline-offset-4 hover:text-azur hover:underline">
            Déconnexion
          </button>
        </div>
      </header>
      <Console creds={creds} />
    </main>
  );
}

function Console({ creds }: { creds: Creds }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.admin.load(creds);
      setData({
        cites: [...d.cites].sort(byNom),
        sources: [...d.sources].sort(byNom),
        tricycles: [...d.tricycles].sort((a, b) => a.nom.localeCompare(b.nom)),
        clients: [...d.clients].sort((a, b) => a.nom.localeCompare(b.nom)),
        commandes: d.commandes,
      });
      setError("");
    } catch (e) {
      if (e instanceof AppError && e.code === "REFUSE") {
        clearSession();
        router.replace("/login");
        return;
      }
      setError(errorMessage(e));
    }
  }, [creds, router]);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = api.admin.subscribe(
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void load(), 300);
      },
      setLive
    );
    const poll = setInterval(() => void load(), 30000); // filet de sécurité
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      unsubscribe();
    };
  }, [load]);

  return (
    <div className="mt-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Sections">
          {TABS.map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id}
              className={`rounded-2xl border-brut border-ink px-4 py-2 font-bold transition-colors ${tab === t.id ? "bg-ink text-white" : "bg-white hover:bg-sky"}`}
            >
              {t.label}
            </motion.button>
          ))}
        </nav>
        <span className="flex items-center gap-2 text-sm font-bold text-azur">
          <PulseDot color={live ? "#0096FF" : "#C9D5E3"} pulse={live} />
          {live ? "LIVE" : "Connexion…"}
        </span>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {!data ? (
        <Spinner />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {tab === "dashboard" && <AdminDashboard data={data} />}
            {tab === "cites" && <CitesPanel creds={creds} data={data} reload={load} />}
            {tab === "sources" && <SourcesPanel creds={creds} data={data} reload={load} />}
            {tab === "chauffeurs" && <ChauffeursPanel creds={creds} data={data} reload={load} />}
            {tab === "clients" && <ClientsPanel creds={creds} data={data} reload={load} />}
            {tab === "commandes" && <CommandesPanel data={data} />}
            {tab === "securite" && <SecuritePanel creds={creds} reload={load} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
