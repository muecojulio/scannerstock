/**
 * Dibujo del QR: de la matriz a SVG y a texto. Sin DOM, para poder probarlo y
 * para que el PNG del navegador y el SVG que se descarga salgan del mismo
 * original (una sola verdad: `encodeQr`).
 *
 * La zona de silencio —cuatro módulos claros por lado— no es decorativa: sin
 * ella muchos lectores no enganchan el símbolo, sobre todo si el QR va pegado
 * a otro contenido. Va dentro del dibujo, no como relleno de la tarjeta, para
 * que el SVG y el PNG que se descargan la lleven siempre.
 */

import type { QrCode } from "./encode.ts";

/** Módulos de silencio que exige la norma (ISO/IEC 18004 §7.3.2). */
export const QUIET_ZONE = 4;

/** Negro de la casa para los módulos; el contraste manda sobre la estética. */
export const QR_MODULE_COLOR = "#0c0e0a";
export const QR_BACKGROUND_COLOR = "#ffffff";

export type QrSvgOptions = {
  quietZone?: number;
  moduleColor?: string;
  backgroundColor?: string;
  /** Lado mínimo en píxeles de un módulo. Solo afecta al tamaño declarado. */
  moduleSize?: number;
  /** Nombre accesible del gráfico. */
  title?: string;
};

/** La matriz con la zona de silencio ya añadida. */
export function qrModulesWithQuietZone(code: QrCode, quietZone = QUIET_ZONE): boolean[][] {
  const total = code.size + quietZone * 2;
  return Array.from({ length: total }, (_, y) =>
    Array.from({ length: total }, (_, x) => {
      const source = code.modules[y - quietZone];
      return source?.[x - quietZone] ?? false;
    }),
  );
}

/**
 * Camino SVG del QR: una sola figura con un subcamino por tramo horizontal de
 * módulos oscuros. Agrupar por tramos y no por módulo deja el SVG en unos
 * cientos de trazos en lugar de miles, y sigue siendo nítido a cualquier zoom
 * porque son rectángulos de lado entero (`shape-rendering: crispEdges`).
 */
export function qrPathData(code: QrCode, quietZone = QUIET_ZONE): string {
  const modules = qrModulesWithQuietZone(code, quietZone);
  const parts: string[] = [];
  for (let y = 0; y < modules.length; y++) {
    const row = modules[y] as boolean[];
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run]) run++;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join("");
}

/** Texto plano de la matriz: `#` oscuro, `.` claro. Útil para inspeccionarla. */
export function qrTextRows(code: QrCode, quietZone = 0): string[] {
  return qrModulesWithQuietZone(code, quietZone).map((row) =>
    row.map((dark) => (dark ? "#" : ".")).join(""),
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * SVG completo y autónomo del QR, listo para descargar o imprimir. Lleva el
 * ancho en píxeles (los módulos por su lado mínimo) y el `viewBox`, así que
 * escala sin perder nitidez.
 */
export function qrSvgMarkup(code: QrCode, options: QrSvgOptions = {}): string {
  const quietZone = options.quietZone ?? QUIET_ZONE;
  const total = code.size + quietZone * 2;
  const side = total * (options.moduleSize ?? 8);
  const label = options.title ?? `Código QR: ${code.text}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${total} ${total}" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(label)}</title>`,
    `<rect width="${total}" height="${total}" fill="${options.backgroundColor ?? QR_BACKGROUND_COLOR}"/>`,
    `<path d="${qrPathData(code, quietZone)}" fill="${options.moduleColor ?? QR_MODULE_COLOR}" shape-rendering="crispEdges"/>`,
    "</svg>",
    "",
  ].join("\n");
}
