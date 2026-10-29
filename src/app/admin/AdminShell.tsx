"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/ui";
import { AdminGate } from "./AdminGate";
import { useAdminHref } from "./Bases";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/commandes", label: "Commandes" },
  { href: "/maisons", label: "Maisons" },
  { href: "/livreurs", label: "Livreurs" },
  { href: "/cites", label: "Cités & forages" },
  { href: "/statistiques", label: "Statistiques" },
  { href: "/anciens-clients", label: "Anciens clients" },
  { href: "/avis-plateforme", label: "Avis" },
  { href: "/securite", label: "Sécurité" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const a = useAdminHref();
  return (
    <AdminGate>
      {(email, deconnexion) => (
        <div className="min-h-dvh">
          <header className="sticky top-0 z-50 border-b-2 border-ink bg-paper/95 backdrop-blur print:hidden">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
              <Logo href={a("/dashboard")} />
              <button onClick={deconnexion} className="flex items-center gap-1.5 text-sm font-bold text-ink/60 hover:text-danger" title={email}>
                <Icon name="logout" size={18} /> <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
            <nav className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-3" aria-label="Administration">
              {NAV.map((n) => {
                const actif = path.startsWith(a(n.href));
                return (
                  <Link
                    key={n.href}
                    href={a(n.href)}
                    className={`whitespace-nowrap rounded-full border-brut border-ink px-4 py-2 text-sm font-bold transition-colors ${actif ? "bg-ink text-white" : "bg-white hover:bg-sky"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 pb-20 pt-5 print:max-w-none print:p-0">{children}</main>
        </div>
      )}
    </AdminGate>
  );
}
