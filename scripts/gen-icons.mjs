// Génère les PNG du PWA à partir des SVG sources (public/icons + racine app/
// pour la convention favicon/apple-touch-icon de Next.js). Lancé une fois à la
// main (`node scripts/gen-icons.mjs`), pas au build : les PNG sont commités.
import sharp from "sharp";
import { mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const anySvg = readFileSync(join(root, "scripts/icon-any.svg"));
const maskableSvg = readFileSync(join(root, "scripts/icon-maskable.svg"));

mkdirSync(join(root, "public/icons"), { recursive: true });

async function render(svg, size, outPath) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(outPath);
  console.log("✓", outPath.replace(root + "\\", "").replace(root + "/", ""));
}

const icons = join(root, "public/icons");
await render(anySvg, 192, join(icons, "icon-192.png"));
await render(anySvg, 512, join(icons, "icon-512.png"));
await render(maskableSvg, 192, join(icons, "maskable-192.png"));
await render(maskableSvg, 512, join(icons, "maskable-512.png"));
// iOS applique lui-même le masque/arrondi : la source doit être un carré plein,
// opaque, sans coins transparents (sinon ils peuvent apparaître noirs/vides).
await render(maskableSvg, 180, join(icons, "apple-touch-icon.png"));
await render(anySvg, 32, join(icons, "favicon-32.png"));
await render(anySvg, 16, join(icons, "favicon-16.png"));

// Convention Next.js App Router : ces fichiers génèrent automatiquement les
// balises <link rel="icon"> / <link rel="apple-touch-icon"> du <head>.
copyFileSync(join(icons, "favicon-32.png"), join(root, "src/app/icon.png"));
copyFileSync(join(icons, "apple-touch-icon.png"), join(root, "src/app/apple-icon.png"));
console.log("✓ src/app/icon.png + apple-icon.png (favicon Next.js)");
