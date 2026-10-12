import type { ComponentType, ReactNode } from "react";

/**
 * Piezas de estado: región en vivo para lectores de pantalla, giro de carga,
 * esqueleto, insignia y medidor.
 *
 * Regla del sistema: ningún estado se comunica solo con color. Cada insignia
 * lleva texto (y opcionalmente icono), cada carga lleva texto o etiqueta
 * accesible, y cada cambio relevante se anuncia por `role="status"`.
 */

/** Anuncio para lectores de pantalla. No se ve, pero se oye. */
export function LiveRegion({ message, assertive = false }: { message: string; assertive?: boolean }) {
  return (
    <span
      className="sr-only"
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {message}
    </span>
  );
}

/** Giro de progreso indeterminado. Hereda el color del texto del botón. */
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span
      className="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}

/** Bloque de carga. Anima solo el brillo, nunca el tamaño. */
export function Skeleton({ className = "", lines = 0 }: { className?: string; lines?: number }) {
  if (lines > 0) {
    return (
      <span className="block space-y-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className="skeleton skeleton-line block"
            style={{ width: index === lines - 1 ? "62%" : "100%" }}
          />
        ))}
      </span>
    );
  }
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

export type BadgeTone = "good" | "bad" | "warn" | "live" | "neutral";

const BADGE_TONE: Record<BadgeTone, string> = {
  good: "badge badge-good",
  bad: "badge badge-bad",
  warn: "badge badge-warn",
  live: "badge badge-live",
  neutral: "badge",
};

/** Etiqueta corta con tono. Siempre con texto: el color solo refuerza. */
export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  pulse = false,
}: {
  tone?: BadgeTone;
  icon?: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className={BADGE_TONE[tone]}>
      {pulse ? <span className="pulse-dot" aria-hidden="true" /> : null}
      {Icon ? <Icon size={12} strokeWidth={2} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * Medidor lineal. Con `value` es determinado (`role="progressbar"` con
 * `aria-valuenow`); sin `value` es indeterminado y lo anuncia como tal.
 */
export function Meter({
  value,
  max = 100,
  label,
  className = "",
}: {
  value?: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const determinate = typeof value === "number";
  const ratio = determinate ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      className={`meter block ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
    >
      <span
        className={`meter-fill block ${determinate ? "" : "scanline"}`}
        style={determinate ? { width: `${ratio * 100}%` } : { width: "100%" }}
        aria-hidden="true"
      />
    </span>
  );
}
