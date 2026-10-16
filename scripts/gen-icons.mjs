// Génère les PNG du PWA à partir des SVG sources (public/icons + racine app/
// pour la convention favicon/apple-touch-icon de Next.js). Lancé une fois à la
// main (`node scripts/gen-icons.mjs`), pas au build : les PNG sont commités.
import sharp from "sharp";
import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
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

// favicon.ico (16/32/48, images PNG dans un conteneur ICO) : demandé d'office par
// certains navigateurs et robots sur /favicon.ico, même avec icon.png présent.
const tailles = [16, 32, 48];
const pngs = await Promise.all(tailles.map((t) => sharp(anySvg, { density: 384 }).resize(t, t).png().toBuffer()));
const entete = Buffer.alloc(6 + 16 * pngs.length);
entete.writeUInt16LE(0, 0);
entete.writeUInt16LE(1, 2); // type : icône
entete.writeUInt16LE(pngs.length, 4);
let decalage = entete.length;
pngs.forEach((png, i) => {
  const o = 6 + 16 * i;
  entete.writeUInt8(tailles[i], o);
  entete.writeUInt8(tailles[i], o + 1);
  entete.writeUInt16LE(1, o + 4); // plans
  entete.writeUInt16LE(32, o + 6); // bits par pixel
  entete.writeUInt32LE(png.length, o + 8);
  entete.writeUInt32LE(decalage, o + 12);
  decalage += png.length;
});
writeFileSync(join(root, "src/app/favicon.ico"), Buffer.concat([entete, ...pngs]));
console.log("✓ src/app/favicon.ico");
