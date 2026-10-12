/**
 * Descarga y compartición del QR. Solo navegador: la parte pura (la matriz, el
 * SVG, el texto) vive en `encode.ts` y `render.ts`.
 *
 * El botón de descarga tiene que funcionar en cualquier dispositivo, y ahí no
 * hay una sola forma de guardar un archivo:
 *
 *   - iPhone y iPad no descargan con `download`: se guarda desde la hoja de
 *     compartir. Si el navegador puede compartir archivos (`canShare`), esa es
 *     la vía: guardar en Fotos, mandar por mensajería o imprimir desde ahí.
 *   - Android y escritorio sí descargan, y se usa el enlace con `download`.
 *   - El SVG va con el mismo camino que el PNG, pero en vectorial: para un
 *     cartel impreso aguanta cualquier tamaño.
 */

import type { QrCode } from "./encode.ts";
import { QUIET_ZONE, QR_BACKGROUND_COLOR, QR_MODULE_COLOR } from "./render.ts";

/** Nombre base de los archivos que se descargan. */
export const QR_FILE_NAME = "scannerstock-qr";

/** Lado del PNG en píxeles: sobra para imprimir y no pesa nada. */
export const QR_PNG_TARGET = 1024;

/** PNG cuadrado del QR, con la zona de silencio ya dibujada. */
export async function qrPngBlob(code: QrCode, target = QR_PNG_TARGET, quietZone = QUIET_ZONE): Promise<Blob> {
  const total = code.size + quietZone * 2;
  const scale = Math.max(4, Math.floor(target / total));
  const canvas = document.createElement("canvas");
  canvas.width = total * scale;
  canvas.height = total * scale;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo preparar la imagen.");
  context.fillStyle = QR_BACKGROUND_COLOR;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = QR_MODULE_COLOR;
  for (let y = 0; y < code.size; y++) {
    const row = code.modules[y];
    if (!row) continue;
    let x = 0;
    while (x < code.size) {
      if (!row[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < code.size && row[x + run]) run++;
      context.fillRect((x + quietZone) * scale, (y + quietZone) * scale, run * scale, scale);
      x += run;
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("El navegador no pudo generar el PNG.");
  return blob;
}

/** Guarda un blob en el dispositivo mediante un enlace temporal. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** ¿Este navegador puede compartir el archivo? (iOS y Android, sobre todo). */
export function canShareFile(file: File): boolean {
  if (typeof navigator.canShare !== "function" || typeof navigator.share !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    // Algunos navegadores lanzan en vez de responder que no.
    return false;
  }
}

export type ShareResult = "shared" | "cancelled" | "unsupported";

/**
 * Comparte el archivo con la hoja del sistema. Cancelar no es un error: el
 * usuario decidió no compartir y la pantalla no debe decir que falló.
 */
export async function shareFile(file: File, text: string): Promise<ShareResult> {
  if (typeof navigator.share !== "function") return "unsupported";
  try {
    await navigator.share({ files: [file], title: "ScannerStock", text });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}

/** Copia al portapapeles, con el respaldo de la selección para navegadores viejos. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Sin permiso de portapapeles se intenta el camino antiguo.
    }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "true");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand?.("copy") ?? false;
  field.remove();
  if (!copied) throw new Error("El navegador no dejó copiar. Selecciona el enlace a mano.");
}
