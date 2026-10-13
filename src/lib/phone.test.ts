// Lancer : npm test  (node --test, TypeScript retiré à la volée par Node ≥ 22.6)
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPhone, normalizePhone, phoneCI } from "./phone.ts";

test("0789855418, +225789855418, 00225789855418 = même compte", () => {
  const formes = ["0789855418", "+225789855418", "00225789855418", "+2250789855418", "002250789855418", "225789855418", "07 89 85 54 18", "07-89-85-54-18", "+225 07 89 85 54 18"];
  for (const f of formes) assert.equal(normalizePhone(f), "0789855418", f);
});

test("un numéro local à 10 chiffres n'est jamais tronqué", () => {
  assert.equal(normalizePhone("2721000000"), "2721000000");
  assert.equal(normalizePhone("+225 27 21 00 00 00"), "2721000000");
  assert.equal(normalizePhone("2252721000000"), "2721000000");
  assert.equal(normalizePhone("789855418"), "0789855418");
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("   "), "");
});

test("validation CI", () => {
  assert.equal(phoneCI("+225 07 89 85 54 18"), "0789855418");
  assert.equal(phoneCI("0912345678"), null);
  assert.equal(phoneCI("07898554"), null);
});

test("affichage", () => {
  assert.equal(formatPhone("0789855418"), "07 89 85 54 18");
  assert.equal(formatPhone("+225789855418"), "07 89 85 54 18");
});
