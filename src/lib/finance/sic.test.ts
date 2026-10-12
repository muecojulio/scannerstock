import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySic, sicDivision, sicLabel, sicMajorGroup } from "./sic.ts";
import { SIC_DIVISIONS, SIC_MAJOR_GROUPS } from "./sic-data.ts";
import { routeModel } from "./diagnose.ts";

const route = (sic: number | null, sectorText = "") =>
  routeModel({ sectorText, sic, sicDescription: "", name: "", forced: null });

test("tabla vendida: 83 grupos mayores y las 10 divisiones del SIC Manual", () => {
  assert.equal(Object.keys(SIC_MAJOR_GROUPS).length, 83);
  assert.equal(Object.keys(SIC_DIVISIONS).length, 10);
  assert.equal(SIC_MAJOR_GROUPS[49], "Electric, Gas, And Sanitary Services");
  assert.equal(SIC_MAJOR_GROUPS[60], "Depository Institutions");
  assert.equal(SIC_DIVISIONS.H, "Finance, Insurance, And Real Estate");
});

test("grupo mayor y división salen del código de 4 dígitos", () => {
  assert.equal(sicMajorGroup(3571), 35);
  assert.equal(sicMajorGroup(6021), 60);
  assert.equal(sicMajorGroup(4911), 49);
  assert.equal(sicMajorGroup(0), null);
  assert.equal(sicMajorGroup(-1), null);
  assert.equal(sicMajorGroup(10_000), null);
  assert.equal(sicMajorGroup(null), null);
  assert.equal(sicDivision(3571), "D");
  assert.equal(sicDivision(6798), "H");
  assert.equal(sicDivision(9999), "J");
  assert.equal(sicDivision(1900), null); // hueco entre divisiones C y D
});

test("clasificación concluyente: solo donde el SIC lo implica", () => {
  assert.equal(classifySic(6798).model, 4); // REIT
  assert.equal(classifySic(6021).model, 2); // banco comercial
  assert.equal(classifySic(6141).model, 2); // crédito no depositario
  assert.equal(classifySic(6211).model, 2); // casa de bolsa
  assert.equal(classifySic(6712).model, 2); // tenedora bancaria
  assert.equal(classifySic(4911).model, 3); // eléctrica
  assert.equal(classifySic(4924).model, 3); // gas natural
});

test("clasificación no concluyente: aseguradoras, inmobiliarias operativas y tenedoras", () => {
  // Sus reglas contables no son las de un banco ni las de un REIT: se dejan al
  // enrutado por texto y, en su defecto, al Modelo 1.
  assert.equal(classifySic(6311).model, null);
  assert.equal(classifySic(6512).model, null);
  assert.equal(classifySic(6719).model, null);
  assert.equal(classifySic(3571).model, null);
  assert.equal(classifySic(null).model, null);
  // Pero los datos siempre vienen, para mostrarlos en el informe.
  assert.equal(classifySic(6311).majorDescription, "Insurance Carriers");
  assert.equal(classifySic(6311).division, "H");
});

test("etiqueta: usa la descripción de la SEC y cae al grupo mayor", () => {
  assert.equal(sicLabel(3571, "Electronic Computers"), "Electronic Computers (D)");
  assert.equal(sicLabel(3571, ""), "Industrial And Commercial Machinery And Computer Equipment (D)");
  assert.equal(sicLabel(null, "Dato manual"), "Dato manual");
  assert.equal(sicLabel(null, ""), "");
});

test("enrutado: el SIC manda sobre el texto cuando es concluyente", () => {
  // Banco con "software" en el nombre: la clasificación oficial gana.
  assert.equal(route(6021, "Software bancario").model, 2);
  assert.equal(route(4911, "Tecnología").model, 3);
  assert.equal(route(6798, "Fintech").model, 4);
  assert.match(route(6021).reason, /SIC 6021/);
  assert.match(route(4911).reason, /servicio público regulado/);
});

test("enrutado: sin SIC concluyente sigue mandando el sector declarado", () => {
  assert.equal(route(3571, "Tecnología").model, 1);
  assert.equal(route(null, "Banca comercial").model, 2);
  assert.equal(route(null, "Real estate / REIT").model, 4);
  assert.equal(route(null, "Gas natural").model, 3);
  assert.equal(route(1311).model, 1); // petrolera: no es utility regulada
  assert.equal(route(null).model, 1);
});

test("enrutado: el modelo forzado gana sobre todo", () => {
  assert.equal(
    routeModel({ sectorText: "Banca", sic: 6021, sicDescription: "", name: "", forced: 4 }).model,
    4,
  );
});
