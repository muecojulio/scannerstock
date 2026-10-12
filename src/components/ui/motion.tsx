import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useInView } from "@/lib/ui/hooks";

/**
 * Movimiento con propósito: aparición al entrar en pantalla y resplandor que
 * sigue al puntero.
 *
 * Los dos son decorativos, así que se apagan con `prefers-reduced-motion`
 * (el CSS pone el contenido visible de inmediato) y el resplandor solo se
 * engancha en dispositivos con puntero fino, donde el `hover` tiene sentido.
 */

/** Aparición escalonada cuando el bloque entra en pantalla. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { visible, ready } = useInView(ref);
  // Solo se oculta cuando el observador ya confirmó que está fuera de pantalla:
  // el HTML del servidor sale visible y la página nunca queda en blanco.
  const hidden = ready && !visible;

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-visible={hidden ? "false" : "true"}
      style={{ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Tarjeta con elevación al pasar el ratón y halo que sigue al puntero. */
export function SpotlightCard({
  children,
  className = "",
  interactive = true,
  selected = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const ref = useRef<HTMLDivElement>(null);

  function trackPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={trackPointer}
      className={`surface spotlight ${interactive ? "surface-interactive" : ""} ${
        selected ? "selected-ring" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
