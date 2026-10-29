import { test } from "node:test";
import assert from "node:assert/strict";
import { codeTropSimple, numeroDepuisCode } from "./pin.ts";

test("codes trop simples refusés", () => {
  for (const p of ["0000", "7777", "1234", "6789", "9876", "3210", "2580", "1212", "1122"]) assert.equal(codeTropSimple(p), true, p);
});

test("codes ordinaires acceptés", () => {
  for (const p of ["4829", "1357", "0472", "9135"]) assert.equal(codeTropSimple(p), false, p);
});

test("code contenant le numéro de la maison refusé", () => {
  assert.equal(codeTropSimple("5012", 12), true);
  assert.equal(codeTropSimple("0124", 12), true);
  assert.equal(codeTropSimple("4837", 12), false);
  assert.equal(numeroDepuisCode("PROMO 012"), 12);
  assert.equal(numeroDepuisCode("ARC 300"), 300);
});
