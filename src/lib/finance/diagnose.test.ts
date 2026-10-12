import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics, diagnose, emptySnapshot, routeModel } from "./diagnose.ts";
import { reportToMarkdown } from "./format.ts";
import type { MetricOverrides, ModelId } from "./types.ts";

// Métricas sintéticas: un snapshot vacío más los overrides de la prueba.
function run(model: ModelId, overrides: MetricOverrides) {
  const metrics = computeMetrics(emptySnapshot(), overrides);
  return diagnose({ model, metrics, company: "Prueba Inc." });
}

const route = (sectorText: string, sic: number | null = null) =>
  routeModel({ sectorText, sic, sicDescription: "", name: "", forced: null }).model;

test("enrutado: sector escrito → modelo del prompt", () => {
  assert.equal(route("Tecnología"), 1);
  assert.equal(route("Consumo masivo"), 1);
  assert.equal(route("Industria"), 1);
  assert.equal(route("Banca comercial"), 2);
  assert.equal(route("Servicios financieros tradicionales"), 2);
  assert.equal(route("Electricidad y agua"), 3);
  assert.equal(route("Gas natural"), 3);
  assert.equal(route("Infraestructuras"), 3);
  assert.equal(route("Fideicomiso inmobiliario"), 4);
  assert.equal(route("Real estate / REIT"), 4);
});

test("enrutado: SIC y modelo forzado", () => {
  assert.equal(route("", 6798), 4);
  assert.equal(route("", 6021), 2);
  assert.equal(route("", 4911), 3);
  assert.equal(
    routeModel({ sectorText: "Banca", sic: 6021, sicDescription: "", name: "", forced: 4 }).model,
    4,
  );
});

test("Modelo 1 BIEN cuando cumple todas las reglas de salud", () => {
  const r = run(1, {
    revenueGrowth: 6,
    grossMargin: 45,
    roic: 20,
    netDebtToEbitda: 1.2,
    currentRatio: 1.5,
    fcf: 1e9,
  });
  assert.equal(r.verdict, "BIEN");
});

test("Modelo 1 MAL por deuda/EBITDA > 4.5x, liquidez < 1.0 o FCF negativo recurrente", () => {
  const base = { revenueGrowth: 5, grossMargin: 45, roic: 20, currentRatio: 1.5, fcf: 1e9 };
  assert.equal(run(1, { ...base, netDebtToEbitda: 5 }).verdict, "MAL");
  assert.equal(run(1, { ...base, netDebtToEbitda: 1, currentRatio: 0.9 }).verdict, "MAL");
  assert.equal(run(1, { ...base, netDebtToEbitda: 1, fcf: -1e9, fcfPrior: -2e9 }).verdict, "MAL");
});

test("Modelo 1 ESTABLE/EN OBSERVACIÓN cuando no es BIEN ni MAL", () => {
  const r = run(1, { revenueGrowth: 5, grossMargin: 30, roic: 10, netDebtToEbitda: 3, currentRatio: 1.5, fcf: 1e9 });
  assert.equal(r.verdict, "ESTABLE/EN OBSERVACIÓN");
});

test("Modelo 2 BIEN / MAL según CET1, eficiencia, morosidad y cobertura", () => {
  const good = { efficiency: 50, roe: 14, cet1: 12, npl: 1, nplCoverage: 150 };
  assert.equal(run(2, good).verdict, "BIEN");
  assert.equal(run(2, { ...good, cet1: 10 }).verdict, "MAL");
  assert.equal(run(2, { ...good, efficiency: 70 }).verdict, "MAL");
  assert.equal(run(2, { ...good, npl: 4, nplCoverage: 60 }).verdict, "MAL");
  // Morosidad alta pero con cobertura > 100% no es MAL por morosidad.
  assert.notEqual(run(2, { ...good, npl: 4, nplCoverage: 120 }).verdict, "MAL");
});

test("Modelo 3 BIEN / MAL según deuda/EBITDA, cobertura de intereses y CapEx", () => {
  const good = {
    operatingMargin: 20,
    operatingMarginPrior: 20.5,
    netDebtToEbitda: 4,
    interestCoverage: 3.5,
    operatingCashFlow: 5e9,
    capex: 3e9,
  };
  assert.equal(run(3, good).verdict, "BIEN");
  assert.equal(run(3, { ...good, netDebtToEbitda: 6.5 }).verdict, "MAL");
  assert.equal(run(3, { ...good, interestCoverage: 1.2 }).verdict, "MAL");
  assert.equal(run(3, { ...good, operatingCashFlow: 2e9 }).verdict, "MAL");
  // Deuda entre 4.5x y 6x: ni BIEN ni MAL.
  assert.equal(run(3, { ...good, netDebtToEbitda: 5 }).verdict, "ESTABLE/EN OBSERVACIÓN");
});

test("Modelo 4 BIEN / MAL según ocupación, FFO, deuda/activos y payout AFFO", () => {
  const good = { occupancy: 95, ffo: 500, ffoPrior: 450, debtToAssets: 40, affoPayout: 80 };
  assert.equal(run(4, good).verdict, "BIEN");
  assert.equal(run(4, { ...good, occupancy: 75 }).verdict, "MAL");
  assert.equal(run(4, { ...good, ffo: 300 }).verdict, "MAL");
  assert.equal(run(4, { ...good, debtToAssets: 75 }).verdict, "MAL");
  assert.equal(run(4, { ...good, affoPayout: 120 }).verdict, "MAL");
});

test("El informe nunca inventa datos: cifras ausentes quedan como n/d", () => {
  const r = run(1, {});
  assert.equal(r.verdict, "ESTABLE/EN OBSERVACIÓN");
  assert.ok(r.rentabilidad.includes("n/d"));
});

test("reportToMarkdown produce el formato compulsorio del prompt", () => {
  const r = run(1, { revenueGrowth: 6, grossMargin: 45, roic: 20, netDebtToEbitda: 1.2, currentRatio: 1.5, fcf: 1e9 });
  const md = reportToMarkdown({ ticker: "PRU", company: "Prueba Inc.", report: r });
  const headings = [
    "**MODELO DETECTADO EN AUTOMÁTICO: Modelo 1 — Empresas regulares**",
    "### 🚦 DIAGNÓSTICO GENERAL",
    "### 📊 EVALUACIÓN DE SALUD FINANCIERA",
    "- **Rentabilidad del Modelo:**",
    "- **Estructura de Riesgo y Apalancamiento:**",
    "- **Sostenibilidad del Flujo de Efectivo:**",
    "### 🔎 PUNTOS FUERTES Y ALERTAS ROJAS",
    "- **Puntos Fuertes (Pros):**",
    "- **Alertas Rojas (Contras/Riesgos):**",
  ];
  let cursor = 0;
  for (const heading of headings) {
    const idx = md.indexOf(heading, cursor);
    assert.ok(idx >= 0, `falta o fuera de orden: ${heading}`);
    cursor = idx + heading.length;
  }
  assert.ok(md.startsWith("**MODELO DETECTADO"), "no debe llevar preámbulo");
  assert.ok(md.includes("Prueba Inc. (PRU): **BIEN**"));
});
