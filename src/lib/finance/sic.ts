import type { ModelId } from "./types";
import { SIC_DIVISIONS, SIC_DIVISION_RANGES, SIC_MAJOR_GROUPS } from "./sic-data.ts";

/**
 * Enrutado por SIC con la tabla oficial (grupo mayor + división) en vez de
 * rangos escritos a mano. La tabla vive en `sic-data.ts`, generada desde el
 * repositorio público `bigspotteddog/SIC-Codes` (SIC Manual de la OSHA, dominio
 * público) — ver `scripts/vendor-sic.mjs`.
 *
 * Regla de diseño: solo se afirma un modelo cuando el SIC lo implica sin
 * ambigüedad. Aseguradoras (63–64), inmobiliarias operativas (65) y tenedoras
 * (67, salvo 6712) NO se fuerzan: sus reglas contables no son las de un banco
 * ni las de un REIT, así que caen al enrutado por texto y, en su defecto, al
 * Modelo 1. Es el mismo comportamiento que tenía la app antes de la tabla, con
 * la diferencia de que ahora 61xx (crédito no depositario) sí se reconoce como
 * institución financiera.
 */

export type SicClassification = {
  /** Grupo mayor (2 dígitos) del SIC, o null si el código no es válido. */
  majorGroup: number | null;
  /** Letra de la división SIC (A–J), o null. */
  division: string | null;
  /** Descripción oficial del grupo mayor, o "" si no está en la tabla. */
  majorDescription: string;
  /** Modelo que el SIC implica por sí solo, o null si no es concluyente. */
  model: ModelId | null;
  /** Razón legible para mostrar en el informe. "" cuando no hay veredicto. */
  reason: string;
};

const NO_CLASSIFICATION: SicClassification = {
  majorGroup: null,
  division: null,
  majorDescription: "",
  model: null,
  reason: "",
};

function isValidSic(sic: number | null | undefined): sic is number {
  return typeof sic === "number" && Number.isFinite(sic) && sic >= 1 && sic <= 9999;
}

/** 3571 → 35. Devuelve null si el código no es un SIC de 4 dígitos válido. */
export function sicMajorGroup(sic: number | null | undefined): number | null {
  if (!isValidSic(sic)) return null;
  return Math.floor(sic / 100);
}

/** 3571 → "D" (Manufacturing). */
export function sicDivision(sic: number | null | undefined): string | null {
  const major = sicMajorGroup(sic);
  if (major == null) return null;
  for (const [letter, low, high] of SIC_DIVISION_RANGES) {
    if (major >= low && major <= high) return letter;
  }
  return null;
}

/**
 * Etiqueta para la UI: "3571 · Industrial And Commercial Machinery… (D)".
 * Usa la descripción de la SEC si viene; si no, la del grupo mayor.
 */
export function sicLabel(sic: number | null | undefined, secDescription = ""): string {
  if (!isValidSic(sic)) return secDescription;
  const major = sicMajorGroup(sic) ?? 0;
  const description = secDescription.trim() || SIC_MAJOR_GROUPS[major] || "";
  const division = sicDivision(sic);
  const suffix = division && SIC_DIVISIONS[division] ? ` (${division})` : "";
  return description ? `${description}${suffix}` : String(sic);
}

/** Clasifica un SIC: datos siempre; modelo solo cuando el código es concluyente. */
export function classifySic(sic: number | null | undefined): SicClassification {
  const major = sicMajorGroup(sic);
  if (major == null) return NO_CLASSIFICATION;
  const division = sicDivision(sic);
  const majorDescription = SIC_MAJOR_GROUPS[major] ?? "";
  const code = String(sic).padStart(4, "0");
  const where = majorDescription ? `SIC ${code} · ${majorDescription}` : `SIC ${code}`;

  // 6798 es el único código de "real estate" que garantiza estructura REIT.
  if (sic === 6798) {
    return { majorGroup: major, division, majorDescription, model: 4, reason: `${where}: fideicomiso de inversión inmobiliaria (REIT).` };
  }
  if (major === 60 || major === 61) {
    return { majorGroup: major, division, majorDescription, model: 2, reason: `${where}: institución depositaria o de crédito.` };
  }
  if (major === 62) {
    return { majorGroup: major, division, majorDescription, model: 2, reason: `${where}: intermediario bursátil o de materias primas.` };
  }
  // 6712 = oficinas de tenedoras de acciones bancarias (no el resto de 67xx).
  if (sic === 6712) {
    return { majorGroup: major, division, majorDescription, model: 2, reason: `${where}: tenedora de institución bancaria.` };
  }
  if (major === 49) {
    return { majorGroup: major, division, majorDescription, model: 3, reason: `${where}: servicio público regulado de electricidad, gas o agua.` };
  }
  return { majorGroup: major, division, majorDescription, model: null, reason: "" };
}
