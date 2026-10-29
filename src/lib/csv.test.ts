import { test } from "node:test";
import assert from "node:assert/strict";
import { cellule, maisonsEnCsv } from "./csv.ts";

test("format imprimeur", () => {
  const csv = maisonsEnCsv([{ id: "x", code_affichage: "PROMO 012", qr_token: "K7QX2P", lien_qr: "https://awa-songon.vercel.app/m/K7QX2P", cite: "Promogim", numero: 12 }]);
  assert.equal(csv, "code_affichage,qr_token,lien_qr,cite,numero\r\nPROMO 012,K7QX2P,https://awa-songon.vercel.app/m/K7QX2P,Promogim,12\r\n");
});

test("guillemets et virgules échappés", () => {
  assert.equal(cellule('Cité "A", B'), '"Cité ""A"", B"');
});

test("injection de formule neutralisée", () => {
  assert.equal(cellule("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(cellule("+33"), "'+33");
  assert.equal(cellule("@SUM"), "'@SUM");
});
