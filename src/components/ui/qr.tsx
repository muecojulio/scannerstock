import { useMemo } from "react";
import { encodeQr, type EccLevel } from "@/lib/qr/encode";
import { QUIET_ZONE, QR_BACKGROUND_COLOR, QR_MODULE_COLOR, qrPathData } from "@/lib/qr/render";

/**
 * El QR en pantalla, como SVG.
 *
 * Vectorial a propósito: se ve nítido en cualquier pantalla y en cualquier
 * zoom, pesa menos que una imagen y no depende de ninguna petición de red. El
 * fondo blanco y la zona de silencio van dentro del dibujo —no son estilo, son
 * requisitos de lectura—, así que lo que se ve es lo mismo que se descarga.
 *
 * El nivel de corrección es Q (25 %): el símbolo se imprime, se fotografía y se
 * pega en sitios donde se mancha. Con el enlace de la app (unas decenas de
 * caracteres) la diferencia de densidad es de un par de módulos.
 */
export function QrCode({
  value,
  ecc = "Q",
  className = "",
  label,
}: {
  value: string;
  ecc?: EccLevel;
  className?: string;
  /** Nombre accesible. Por defecto, el propio enlace. */
  label?: string;
}) {
  const code = useMemo(() => encodeQr(value, { ecc }), [value, ecc]);
  const total = code.size + QUIET_ZONE * 2;
  const path = useMemo(() => qrPathData(code, QUIET_ZONE), [code]);

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className={className}
      role="img"
      aria-label={label ?? `Código QR de ${value}`}
      shapeRendering="crispEdges"
      focusable="false"
    >
      <rect width={total} height={total} fill={QR_BACKGROUND_COLOR} />
      <path d={path} fill={QR_MODULE_COLOR} />
    </svg>
  );
}
