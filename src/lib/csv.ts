/** Export CSV pour l'imprimeur : `code_affichage,qr_token,lien_qr,cite,numero`. */

export type MaisonExport = { id: string; code_affichage: string; qr_token: string; lien_qr: string; cite: string; numero: number };

/** Échappe une cellule. Les cellules qui commencent par = + - @ (ou tab / retour)
 *  sont préfixées d'une apostrophe : Excel les exécuterait comme des formules
 *  (« injection CSV »), par exemple via un nom de cité malveillant. */
export function cellule(v: string | number): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function maisonsEnCsv(rows: MaisonExport[]): string {
  const lignes = [["code_affichage", "qr_token", "lien_qr", "cite", "numero"].join(",")];
  for (const r of rows) lignes.push([r.code_affichage, r.qr_token, r.lien_qr, r.cite, r.numero].map(cellule).join(","));
  return lignes.join("\r\n") + "\r\n";
}

/** Déclenche le téléchargement (BOM UTF-8 : les accents s'affichent bien dans Excel). */
export function telechargerCsv(nom: string, contenu: string) {
  const blob = new Blob(["﻿" + contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
