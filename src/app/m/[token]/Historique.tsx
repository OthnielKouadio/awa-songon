"use client";

import { ErrorBox, Spinner } from "@/components/ui";
import { appareilPour } from "@/lib/appareils";
import { QUANTITE_L, STATUT_COMMANDE, dateHeure, fcfa } from "@/lib/format";
import { useRpc } from "@/lib/useRpc";

type Ligne = { id: string; reference: string; statut: string; created_at: string; livree_at: string | null; commande_par: string; prix_fcfa: number; livreur: string };
type Mois = { mois: string; livraisons: number; total_fcfa: number };

const args = (qr: string) => ({ p_qr: qr, p_jeton: appareilPour(qr)?.jeton ?? "" });

/** Toutes les commandes du foyer (100 dernières), avec lien de suivi. */
export function Historique({ qr }: { qr: string }) {
  const { data, err, chargement } = useRpc<Ligne[]>("m_historique", args(qr), qr);
  if (chargement && !data) return <Spinner />;
  if (err) return <ErrorBox>{err}</ErrorBox>;
  if (!data?.length) return <p className="font-semibold text-ink/55">Aucune commande pour l&apos;instant.</p>;
  return (
    <ul className="divide-y divide-ink/10 rounded-2xl border-brut border-ink bg-white">
      {data.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <span>
            <strong>#{c.reference}</strong> · {c.commande_par} · {c.livreur}
            <span className="block text-ink/55">{dateHeure(c.created_at)}</span>
          </span>
          <span className="text-right">
            <strong>{STATUT_COMMANDE[c.statut] ?? c.statut}</strong>
            <span className="block text-ink/55">{fcfa(c.prix_fcfa)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const nomMois = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Consommation par mois (12 derniers mois) : citernes, litres, dépense en eau. */
export function Consommation({ qr }: { qr: string }) {
  const { data, err, chargement } = useRpc<Mois[]>("m_consommation", args(qr), qr);
  if (chargement && !data) return <Spinner />;
  if (err) return <ErrorBox>{err}</ErrorBox>;
  const mois = data ?? [];
  const max = Math.max(1, ...mois.map((m) => m.livraisons));
  const total = mois.reduce((a, m) => ({ l: a.l + m.livraisons, f: a.f + m.total_fcfa }), { l: 0, f: 0 });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat k="Citernes" v={String(total.l)} />
        <Stat k="Eau reçue" v={`${((total.l * QUANTITE_L) / 1000).toLocaleString("fr-FR")} m³`} />
        <Stat k="Dépense" v={fcfa(total.f)} />
      </div>
      {mois.length === 0 ? (
        <p className="font-semibold text-ink/55">Aucune livraison sur les 12 derniers mois.</p>
      ) : (
        <ul className="space-y-2">
          {[...mois].reverse().map((m) => (
            <li key={m.mois}>
              <div className="flex justify-between text-sm font-bold">
                <span className="capitalize">{nomMois(m.mois)}</span>
                <span>
                  {m.livraisons} citerne{m.livraisons > 1 ? "s" : ""} · {fcfa(m.total_fcfa)}
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-mist">
                <div className="h-full rounded-full bg-azur" style={{ width: `${(m.livraisons / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-ink/15 bg-white px-2 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink/50">{k}</p>
      <p className="mt-0.5 font-display text-lg font-bold">{v}</p>
    </div>
  );
}
