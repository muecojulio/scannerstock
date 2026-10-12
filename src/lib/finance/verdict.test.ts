import assert from "node:assert/strict";
import { test } from "node:test";
import { verdictFull, verdictRank, verdictShort, verdictTone } from "./verdict.ts";

test("los tres veredictos oficiales tienen su tono", () => {
  assert.equal(verdictTone("BIEN"), "good");
  assert.equal(verdictTone("MAL"), "bad");
  assert.equal(verdictTone("ESTABLE/EN OBSERVACIÓN"), "warn");
});

test("un veredicto desconocido no se trata como bueno ni como malo", () => {
  assert.equal(verdictTone("SIN DATO"), "warn");
  assert.equal(verdictTone(""), "warn");
  assert.equal(verdictRank("SIN DATO"), 1);
});

test("la etiqueta corta solo acorta el veredicto largo", () => {
  assert.equal(verdictShort("ESTABLE/EN OBSERVACIÓN"), "En observación");
  assert.equal(verdictShort("BIEN"), "BIEN");
  assert.equal(verdictShort("MAL"), "MAL");
});

test("el nombre largo se lee como frase", () => {
  assert.equal(verdictFull("ESTABLE/EN OBSERVACIÓN"), "Estable / en observación");
  assert.equal(verdictFull("BIEN"), "BIEN");
});

test("la severidad ordena de bueno a malo", () => {
  assert.ok(verdictRank("BIEN") > verdictRank("ESTABLE/EN OBSERVACIÓN"));
  assert.ok(verdictRank("ESTABLE/EN OBSERVACIÓN") > verdictRank("MAL"));
});
