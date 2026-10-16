import { test } from "node:test";
import assert from "node:assert/strict";
import { pinTropSimple } from "./pin.ts";

test("PIN trop simples refusés", () => {
  for (const p of ["0000", "7777", "1234", "6789", "9876", "3210", "2580", "1212"]) assert.equal(pinTropSimple(p), true, p);
});

test("PIN ordinaires acceptés", () => {
  for (const p of ["4829", "1357", "0472", "9135"]) assert.equal(pinTropSimple(p), false, p);
});
