#!/usr/bin/env node
/**
 * Regenera `src/lib/finance/sic-data.ts` desde un repositorio público de GitHub.
 *
 *   node scripts/vendor-sic.mjs            # escribe el archivo
 *   node scripts/vendor-sic.mjs --check    # solo compara, no escribe (CI)
 *
 * Fuente: `bigspotteddog/SIC-Codes` → `sic_codes.csv`, una transcripción del
 * SIC Manual de la OSHA (obra del gobierno de EE. UU., dominio público). Se
 * descarga por la API pública de GitHub (sin llave, sin registro) y se reduce a
 * los 83 grupos mayores + 10 divisiones, que es lo único que usa la app.
 *
 * No corre en el build: es mantenimiento manual. El archivo generado está
 * versionado para que la aplicación no dependa de GitHub en runtime.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "bigspotteddog/SIC-Codes";
const FILE = "sic_codes.csv";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src/lib/finance/sic-data.ts");

const DIVISION_RANGES = [
  ["A", 1, 9],
  ["B", 10, 14],
  ["C", 15, 17],
  ["D", 20, 39],
  ["E", 40, 49],
  ["F", 50, 51],
  ["G", 52, 59],
  ["H", 60, 67],
  ["I", 70, 89],
  ["J", 91, 99],
];

/** "ELECTRIC, GAS, AND SANITARY SERVICES" → "Electric, Gas, And Sanitary Services". */
export function titleCase(value) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

/** Divide el TSV público en divisiones (A–J) y grupos mayores (NN00). */
export function parseSicTable(tsv) {
  const divisions = new Map();
  const majors = new Map();
  for (const line of String(tsv).split("\n")) {
    const [code, description] = line.split("\t");
    if (!code || !description) continue;
    if (/^[A-J]$/.test(code)) divisions.set(code, titleCase(description));
    else if (/^\d{2}00$/.test(code)) majors.set(Number(code.slice(0, 2)), titleCase(description));
  }
  if (divisions.size === 0 || majors.size === 0) {
    throw new Error("La tabla SIC no trajo divisiones ni grupos mayores: formato inesperado.");
  }
  return { divisions, majors };
}

export function renderSicData({ divisions, majors, source }) {
  const rows = [...majors.entries()].sort((a, b) => a[0] - b[0]);
  return `/**
 * Clasificación SIC por grupo mayor (2 dígitos) + división.
 *
 * GENERADO por scripts/vendor-sic.mjs — no editar a mano. Origen: SIC Manual de
 * la OSHA / Oficina de Presupuesto de EE. UU. (obra del gobierno federal,
 * dominio público), tomado del repositorio público de GitHub \`${REPO}\`
 * (https://github.com/${REPO}, archivo ${FILE}${source ? `, ${source}` : ""}).
 * Se conservan solo los ${rows.length} grupos mayores y las ${divisions.size}
 * divisiones: es lo que la aplicación necesita para enrutar el modelo de
 * negocio cuando la SEC no devuelve descripción, y pesa ~8 KB en vez de los
 * 139 KB de la tabla completa de 4 dígitos.
 *
 * Regenerar: node scripts/vendor-sic.mjs (verificar: --check).
 */

/** División SIC (letra) → nombre en inglés, tal como la publica el SIC Manual. */
export const SIC_DIVISIONS: Readonly<Record<string, string>> = {
${DIVISION_RANGES.map(([code]) => `  ${code}: ${JSON.stringify(divisions.get(code) ?? "")},`).join("\n")}
};

/** Rango de grupos mayores de cada división. */
export const SIC_DIVISION_RANGES: ReadonlyArray<readonly [string, number, number]> = [
${DIVISION_RANGES.map(([c, lo, hi]) => `  ["${c}", ${lo}, ${hi}],`).join("\n")}
];

/** Grupo mayor (2 dígitos) → descripción oficial del SIC Manual. */
export const SIC_MAJOR_GROUPS: Readonly<Record<number, string>> = {
${rows.map(([code, description]) => `  ${code}: ${JSON.stringify(description)},`).join("\n")}
};
`;
}

async function download() {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "scannerstock-vendor-sic" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status} al pedir ${REPO}/${FILE}.`);
  const body = await response.json();
  const content = Buffer.from(String(body.content ?? ""), "base64").toString("utf8");
  if (!content.includes("\t")) throw new Error("El archivo descargado no parece el TSV de SIC.");
  return { content, source: `commit ${String(body.sha ?? "").slice(0, 7)}` };
}

const onlyCheck = process.argv.includes("--check");
const { content, source } = await download();
const rendered = renderSicData({ ...parseSicTable(content), source });

if (onlyCheck) {
  const current = readFileSync(OUT, "utf8");
  if (current === rendered) {
    console.log("sic-data.ts está al día con la fuente pública.");
  } else {
    console.error("sic-data.ts difiere de la fuente pública. Corre: node scripts/vendor-sic.mjs");
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUT, rendered);
  console.log(`Escrito ${OUT} desde ${REPO}/${FILE}.`);
}
