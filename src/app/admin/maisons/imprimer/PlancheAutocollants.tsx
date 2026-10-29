"use client";

import Link from "next/link";
import { Sticker } from "@/components/Sticker";
import { Btn, ErrorBox, Spinner } from "@/components/ui";
import { maisonsEnCsv, telechargerCsv, type MaisonExport } from "@/lib/csv";
import { useRpc } from "@/lib/useRpc";
import { useAdminHref } from "../../Bases";

/**
 * Planche d'autocollants 5 × 5 cm à taille réelle : 15 par feuille A4
 * (3 colonnes × 5 lignes), traits de coupe en pointillés. « Imprimer »
 * → « Enregistrer en PDF » donne un PDF vectoriel à envoyer à l'imprimeur.
 */
export function PlancheAutocollants({ cite, debut, fin, ids }: { cite: string | null; debut: number | null; fin: number | null; ids: string[] | null }) {
  const args = { p_cite: cite, p_debut: debut, p_fin: fin, p_ids: ids };
  const a = useAdminHref();
  const { data, err, chargement } = useRpc<MaisonExport[]>("admin_export_maisons", args, JSON.stringify(args));

  return (
    <div>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .planche { gap: 4mm !important; }
          .sticker-cell { break-inside: avoid; }
        }
      `}</style>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href={a("/maisons")} className="text-sm font-bold text-azur hover:underline">
            ← Maisons
          </Link>
          <h1 className="title-md mt-1">Autocollants</h1>
          {data && (
            <p className="font-semibold text-ink/60">
              {data.length} autocollant{data.length > 1 ? "s" : ""} · {Math.ceil(data.length / 15)} feuille{data.length > 15 ? "s" : ""} A4 · 5 × 5 cm
            </p>
          )}
        </div>
        {data && data.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Btn variant="white" onClick={() => telechargerCsv("autocollants.csv", maisonsEnCsv(data))}>
              CSV
            </Btn>
            <Btn onClick={() => window.print()}>Imprimer / PDF</Btn>
          </div>
        )}
      </div>
      <p className="mb-4 rounded-2xl bg-sky p-3 text-sm font-semibold print:hidden">
        Dans la fenêtre d&apos;impression : format A4, échelle <strong>100 %</strong> (pas « ajuster à la page »), marges par défaut, et coche « graphiques d&apos;arrière-plan ».
      </p>

      {err && <ErrorBox>{err}</ErrorBox>}
      {chargement && !data && <Spinner />}

      <div className="planche mx-auto grid w-fit grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3 print:grid-cols-3">
        {data?.map((m) => (
          <div key={m.id} className="sticker-cell outline-dashed outline-1 outline-offset-[2mm] outline-ink/25">
            <Sticker code={m.code_affichage} lien={m.lien_qr} />
          </div>
        ))}
      </div>
    </div>
  );
}
