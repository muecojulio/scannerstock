import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clamp, resolveReveal } from "@/lib/ui/gestures";
import { useSwipeGesture } from "@/lib/ui/hooks";
import { LiveRegion } from "./status";

/**
 * Fila que revela acciones al deslizar en horizontal.
 *
 * Reglas que sigue, y que son el motivo de que exista este componente:
 *
 *   - El swipe **nunca** es la única manera: hay un botón visible (⋯) que abre
 *     y cierra el panel, con `aria-expanded`/`aria-controls`.
 *   - El desplazamiento vertical de la página se conserva: bloqueo de eje con
 *     `resolveGesture` y `touch-action: pan-y`, así el navegador sigue haciendo
 *     su scroll mientras el eje no sea claramente lateral.
 *   - El gesto no arranca sobre botones, enlaces o campos anidados.
 *   - El arrastre se limita al ancho del panel de acciones, con umbral por
 *     distancia y por velocidad (flick).
 *   - El clic que sigue a un arrastre se descarta: mover la fila no activa la
 *     tarjeta por accidente.
 *   - Mientras están ocultas, las acciones están `inert` y `aria-hidden`: ni se
 *     anuncian ni entran en el orden de foco.
 *   - En escritorio no hay swipe: las acciones se muestran siempre, en una fila
 *     propia bajo el contenido.
 */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type SwipeAction = {
  id: string;
  label: string;
  icon?: IconComponent;
  tone?: "scan" | "copy" | "neutral";
  onSelect: () => void;
};

const TONE_CLASS: Record<NonNullable<SwipeAction["tone"]>, string> = {
  scan: "swipe-action swipe-action-scan",
  copy: "swipe-action swipe-action-copy",
  neutral: "swipe-action bg-panel-2 text-ivory",
};

export function SwipeRow({
  actions,
  label,
  children,
  className = "",
  contentClassName = "",
}: {
  actions: readonly SwipeAction[];
  /** Nombre de la fila para las etiquetas accesibles: p. ej. "AAPL". */
  label: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const firstRender = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef(false);
  const actionsId = `swipe-actions-${useId()}`;

  const panelWidth = () => panelRef.current?.getBoundingClientRect().width ?? actions.length * 84;
  const settled = open ? -panelWidth() : 0;
  const translate = dragOffset ?? settled;

  const gesture = useSwipeGesture({
    startOffset: () => (open ? -panelWidth() : 0),
    clampOffset: (offset) => {
      if (offset > 0) return offset * 0.25; // resistencia al sobrepasar el borde
      return clamp(offset, -panelWidth(), 0);
    },
    panelWidth,
    onDrag: (offset) => setDragOffset(offset),
    onRelease: ({ offset, velocityX, width }) => {
      const next = resolveReveal({ offset, width: width || panelWidth(), velocityX });
      setDragOffset(null);
      setOpen(next === "open");
    },
    onCancel: () => setDragOffset(null),
  });

  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      firstActionRef.current?.focus();
    }
  }, [open]);

  // El cambio de estado se anuncia por lector de pantalla; al montar, no.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setAnnouncement(open ? `Acciones de ${label} abiertas` : `Acciones de ${label} ocultas`);
  }, [open, label]);

  function toggle() {
    setOpen((current) => {
      if (!current) focusOnOpen.current = true;
      return !current;
    });
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <div className={`swipe-row ${className}`} data-open={open} onKeyDown={onKeyDown}>
      {/* Panel táctil: se revela al deslizar. Fuera de foco y del árbol de
          accesibilidad mientras está oculto. */}
      <div
        ref={panelRef}
        id={actionsId}
        role="group"
        aria-label={`Acciones de ${label}`}
        aria-hidden={!open}
        inert={!open}
        className="swipe-actions md:hidden"
      >
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              ref={index === 0 ? firstActionRef : undefined}
              type="button"
              className={TONE_CLASS[action.tone ?? "neutral"]}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {Icon ? <Icon size={16} strokeWidth={2} aria-hidden="true" /> : null}
              <span className="text-center leading-tight">{action.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className={`swipe-content ${contentClassName}`}
        data-gesture-scroller
        data-dragging={gesture.dragging}
        style={{ transform: `translate3d(${translate}px, 0, 0)`, transition: gesture.dragging ? "none" : undefined }}
        {...gesture.handlers}
      >
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1">{children}</div>
          <button
            ref={toggleRef}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={actionsId}
            aria-label={open ? `Ocultar acciones de ${label}` : `Mostrar acciones de ${label}`}
            className="swipe-toggle md:hidden"
          >
            {open ? <ChevronRight size={18} strokeWidth={2} aria-hidden="true" /> : <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Escritorio: las mismas acciones, siempre visibles, sin gesto. */}
      <div className="hidden gap-2 border-t border-line px-3 py-2 md:flex md:justify-end" role="group" aria-label={`Acciones de ${label}`}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => action.onSelect()}
            >
              {Icon ? <Icon size={15} strokeWidth={2} aria-hidden="true" /> : null}
              {action.label}
            </button>
          );
        })}
      </div>

      <LiveRegion message={announcement} />
    </div>
  );
}
