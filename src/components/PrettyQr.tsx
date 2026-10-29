import QRCode from "qrcode";
import { useMemo } from "react";

/**
 * QR code « joli » en SVG vectoriel (net à toutes les tailles, idéal pour
 * l'imprimeur) :
 *  - modules ronds reliés entre eux (look « liquide ») ;
 *  - 3 yeux arrondis, centre bleu Distribution Eau ;
 *  - goutte d'eau au centre.
 * Correction d'erreur niveau H (30 % du code peut manquer) : la goutte ne
 * masque qu'environ 5 % des modules, le QR reste lisible même un peu rayé.
 */
export function PrettyQr({
  value,
  size = "100%",
  ink = "#0A1931",
  accent = "#0096FF",
  logo = true,
}: {
  value: string;
  size?: number | string;
  ink?: string;
  accent?: string;
  logo?: boolean;
}) {
  const { n, path, eyes, logoBox } = useMemo(() => build(value, logo), [value, logo]);
  // Marge blanche (« quiet zone ») : 2 modules, + le blanc de l'autocollant autour.
  const margin = 2;
  const vb = n + margin * 2;
  return (
    <svg
      viewBox={`${-margin} ${-margin} ${vb} ${vb}`}
      width={size}
      height={size}
      role="img"
      aria-label={`QR code : ${value}`}
      shapeRendering="geometricPrecision"
      style={{ display: "block" }}
    >
      <rect x={-margin} y={-margin} width={vb} height={vb} fill="#fff" />
      <path d={path} fill={ink} />
      {eyes.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          {/* anneau extérieur 7×7 (épaisseur 1 module) */}
          <path
            fillRule="evenodd"
            fill={ink}
            d={`${roundRect(x, y, 7, 7, 2.2)} ${roundRect(x + 1, y + 1, 5, 5, 1.4)}`}
          />
          {/* pupille 3×3 */}
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={accent} />
        </g>
      ))}
      {logoBox && (
        <g>
          <rect x={logoBox.x + 0.3} y={logoBox.y + 0.3} width={logoBox.s - 0.6} height={logoBox.s - 0.6} rx={1.4} fill="#fff" stroke={ink} strokeWidth={0.35} />
          {/* goutte (même tracé que l'icône du site, 24×24 → mise à l'échelle) */}
          <g transform={`translate(${logoBox.x + logoBox.s * 0.18} ${logoBox.y + logoBox.s * 0.16}) scale(${(logoBox.s * 0.64) / 24})`}>
            <path d="M12 2.5c3.6 4.3 6.2 7.5 6.2 10.8a6.2 6.2 0 1 1-12.4 0C5.8 10 8.4 6.8 12 2.5z" fill={accent} />
            <path d="M9.2 14.2a3 3 0 0 0 2.6 2.9" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
          </g>
        </g>
      )}
    </svg>
  );
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - 2 * r}a${r},${r} 0 0 1 -${r},-${r}v-${h - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z`;
}

function build(value: string, withLogo: boolean) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && qr.modules.get(r, c) === 1;

  const inEye = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // Zone du logo : carré impair centré, ~22 % du côté. Seulement jusqu'à la
  // version 6 : à partir de la 7, un motif d'alignement occupe le centre.
  let logoBox: { x: number; y: number; s: number } | null = null;
  if (withLogo && qr.version <= 6) {
    let s = Math.round(n * 0.22);
    if (s % 2 === 0) s += 1;
    const start = (n - s) / 2;
    logoBox = { x: start, y: start, s };
  }
  const inLogo = (r: number, c: number) =>
    !!logoBox && r >= logoBox.y && r < logoBox.y + logoBox.s && c >= logoBox.x && c < logoBox.x + logoBox.s;
  const visible = (r: number, c: number) => dark(r, c) && !inEye(r, c) && !inLogo(r, c);

  // Chaque module = un disque ; deux voisins sombres sont reliés par un pont
  // de même largeur → traits arrondis continus. Disques ET ponts sont tracés
  // dans le MÊME sens (horaire) : avec la règle de remplissage « nonzero », des
  // sens opposés s'annuleraient là où ils se chevauchent (trous blancs → QR illisible).
  const R = 0.49;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!visible(r, c)) continue;
      const cx = c + 0.5;
      const cy = r + 0.5;
      parts.push(`M${cx - R},${cy}a${R},${R} 0 1,1 ${2 * R},0a${R},${R} 0 1,1 -${2 * R},0z`);
      if (visible(r, c + 1)) parts.push(`M${cx},${cy - R}h1v${2 * R}h-1z`);
      if (visible(r + 1, c)) parts.push(`M${cx - R},${cy}h${2 * R}v1h-${2 * R}z`);
    }
  }

  return {
    n,
    path: parts.join(""),
    eyes: [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as [number, number][],
    logoBox,
  };
}
