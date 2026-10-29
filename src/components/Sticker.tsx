import { PrettyQr } from "./PrettyQr";

/**
 * Autocollant 5 × 5 cm (dimensions réelles en mm, pour l'impression) :
 *   EN GROS     : PROMO 012
 *   AU MILIEU   : gros QR code (lien_qr)
 *   EN TOUT PETIT : le lien, pour le taper à la main si le QR est abîmé.
 */
export function Sticker({ code, lien }: { code: string; lien: string }) {
  // Code long (« AKWAB 1234 ») : un peu plus petit pour tenir sur une ligne.
  const fontMm = code.length <= 9 ? 7.4 : code.length <= 11 ? 6.2 : 5.2;
  return (
    <div
      className="sticker flex flex-col items-center justify-between bg-white text-ink"
      style={{ width: "50mm", height: "50mm", padding: "2.4mm 2.4mm 1.8mm", borderRadius: "4mm", border: "0.5mm solid #0A1931", boxSizing: "border-box" }}
    >
      <div className="font-display font-bold leading-none tracking-tight" style={{ fontSize: `${fontMm}mm`, whiteSpace: "nowrap" }}>
        {code}
      </div>
      <div style={{ width: "33mm", height: "33mm" }}>
        <PrettyQr value={lien} />
      </div>
      <div className="font-sans font-semibold leading-none text-ink/70" style={{ fontSize: "1.95mm", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
        {lien.replace(/^https?:\/\//, "")}
      </div>
    </div>
  );
}
