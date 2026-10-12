import type { Verdict } from "./types";

/**
 * Presentación del veredicto, en un solo sitio.
 *
 * Antes cada pantalla traducía el veredicto a su manera (el informe con un
 * mapa de clases, el historial con un ternario anidado). La regla de negocio
 * —qué es BIEN, qué es MAL y qué queda en observación— no cambia: solo deja de
 * estar escrita tres veces.
 */

export type VerdictTone = "good" | "bad" | "warn";

/** Veredictos que no sean los tres oficiales caen en "en observación". */
export function verdictTone(verdict: string): VerdictTone {
  if (verdict === "BIEN") return "good";
  if (verdict === "MAL") return "bad";
  return "warn";
}

/** Etiqueta corta: "ESTABLE/EN OBSERVACIÓN" no cabe en una insignia. */
export function verdictShort(verdict: string): string {
  return verdict === "ESTABLE/EN OBSERVACIÓN" ? "En observación" : verdict;
}

/** Nombre largo del veredicto, como aparece en el informe. */
export function verdictFull(verdict: Verdict | string): string {
  return verdict === "ESTABLE/EN OBSERVACIÓN" ? "Estable / en observación" : verdict;
}

/** Orden de severidad, para agrupar o priorizar listas. */
export function verdictRank(verdict: string): number {
  const tone = verdictTone(verdict);
  return tone === "good" ? 2 : tone === "warn" ? 1 : 0;
}
