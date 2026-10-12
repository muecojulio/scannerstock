import type { Report } from "./types";

/**
 * Genera el informe como texto Markdown con el formato compulsorio del
 * prompt de análisis: modelo detectado, diagnóstico general, evaluación de
 * salud financiera y puntos fuertes / alertas rojas. Función pura: no depende
 * del DOM ni del servidor, así se puede copiar desde la UI y probar aparte.
 */
export function reportToMarkdown(input: {
  ticker: string;
  company: string;
  report: Report;
}): string {
  const { report } = input;
  const header = input.company ? `${input.company} (${input.ticker})` : input.ticker;
  const bullets = (items: string[]) => items.map((item) => `  - ${item}`).join("\n");

  return [
    `**MODELO DETECTADO EN AUTOMÁTICO: ${report.modelName}**`,
    "",
    "### 🚦 DIAGNÓSTICO GENERAL",
    `${header}: **${report.verdict}**`,
    "",
    "### 📊 EVALUACIÓN DE SALUD FINANCIERA",
    `- **Rentabilidad del Modelo:** ${report.rentabilidad}`,
    `- **Estructura de Riesgo y Apalancamiento:** ${report.riesgo}`,
    `- **Sostenibilidad del Flujo de Efectivo:** ${report.flujo}`,
    "",
    "### 🔎 PUNTOS FUERTES Y ALERTAS ROJAS",
    "- **Puntos Fuertes (Pros):**",
    bullets(report.pros),
    "- **Alertas Rojas (Contras/Riesgos):**",
    bullets(report.contras),
    "",
  ].join("\n");
}
