import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { clamp, tabTargetIndex } from "@/lib/ui/gestures";
import { centerInTrack, useIndicator, useLaneEdges, useScrollBehavior, useSwipeGesture } from "@/lib/ui/hooks";

/**
 * Pestañas con el patrón APG (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):
 * `role="tablist"`, cada pestaña con `aria-selected` y su panel relacionado por
 * `id`/`aria-controls`, recorrido con flechas, Inicio y Fin, y una píldora que
 * se desliza hacia la opción activa en lugar de recolorear cada pestaña.
 *
 * Además:
 *   - Si las pestañas no caben, se desplazan en horizontal con el gesto nativo
 *     del navegador, se centra la activa y aparecen bordes difuminados solo
 *     cuando de verdad queda contenido fuera de vista.
 *   - En pantalla táctil se puede cambiar de panel deslizando en horizontal.
 *     El gesto solo actúa con eje lateral claro (proporción 1.2) y nunca
 *     empieza sobre un control, así que no roba el scroll vertical.
 *   - Los paneles no activos quedan `inert`: fuera del orden de foco y del
 *     árbol de accesibilidad mientras están fuera de vista.
 */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type TabItem = {
  id: string;
  label: string;
  icon?: IconComponent;
};

export function Tabs({
  items,
  value,
  onValueChange,
  label,
  panels,
  swipe = true,
  className = "",
  panelClassName = "",
}: {
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /** Nombre accesible del grupo de pestañas, p. ej. "Secciones del informe". */
  label: string;
  panels: Record<string, ReactNode>;
  swipe?: boolean;
  className?: string;
  panelClassName?: string;
}) {
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const activePanelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const behavior = useScrollBehavior();

  const index = Math.max(0, items.findIndex((item) => item.id === value));
  const active = items[index];
  const indicator = useIndicator(listRef, activeTabRef, value);
  const edges = useLaneEdges(listRef, `${value}-${items.length}`);
  const box = useIndicator(viewportRef, activePanelRef, `panel-${value}`);

  const tabId = (id: string) => `tab-${base}-${id}`;
  const panelId = (id: string) => `panel-${base}-${id}`;

  /** Mantiene visible (y centrada, si cabe) la pestaña recién activada. */
  useEffect(() => {
    const list = listRef.current;
    const tab = activeTabRef.current;
    if (!list || !tab) return;
    if (!edges.overflowing) {
      list.scrollTo({ left: 0, behavior });
      return;
    }
    centerInTrack(list, tab, behavior);
  }, [value, edges.overflowing, behavior]);

  const select = useCallback(
    (id: string) => {
      if (id === value) return;
      onValueChange(id);
    },
    [onValueChange, value],
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const currentIndex = items.findIndex((item) => tabId(item.id) === target.id);
    if (currentIndex < 0) return;
    const next = tabTargetIndex(currentIndex, event.key, items.length);
    if (next === null) return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    select(item.id);
    // El foco sigue a la pestaña activada (activación automática, APG).
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    buttons?.[next]?.focus();
    buttons?.[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const gesture = useSwipeGesture({
    enabled: swipe && items.length > 1,
    startOffset: () => 0,
    clampOffset: (offset) => {
      const width = viewportRef.current?.clientWidth ?? 320;
      const atStart = index === 0;
      const atEnd = index === items.length - 1;
      // Resistencia en los extremos: el panel se deja mover un poco y vuelve.
      if ((offset > 0 && atStart) || (offset < 0 && atEnd)) return offset * 0.3;
      return clamp(offset, -width, width);
    },
    onDragStart: () => setDragging(true),
    onDrag: (offset) => setDragX(offset),
    onRelease: ({ offset, velocityX }) => {
      const width = viewportRef.current?.clientWidth ?? 320;
      const projected = offset + velocityX * 110;
      const threshold = Math.max(48, width * 0.2);
      setDragging(false);
      setDragX(0);
      if (projected <= -threshold && index < items.length - 1) {
        const next = items[index + 1];
        if (next) select(next.id);
        return;
      }
      if (projected >= threshold && index > 0) {
        const previous = items[index - 1];
        if (previous) select(previous.id);
      }
    },
    onCancel: () => {
      setDragging(false);
      setDragX(0);
    },
  });

  useEffect(() => {
    if (box && !measured) setMeasured(true);
  }, [box, measured]);

  // El anuncio solo aparece cuando la sección cambia de verdad: al cargar no
  // se anuncia nada, porque nadie lo pidió.
  const first = useRef(value);
  useEffect(() => {
    if (value === first.current) return;
    setAnnouncement(`${active?.label ?? ""} seleccionada`);
  }, [value, active?.label]);

  const trackTransform = `translate3d(${-(index * (box?.width ?? 0)) + dragX}px, 0, 0)`;

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="tab-list"
          data-gesture-scroller
        >
          <span
            className="tab-indicator"
            aria-hidden="true"
            style={{
              transform: `translateX(${indicator?.x ?? 0}px)`,
              width: indicator?.width ?? 0,
              opacity: indicator ? 1 : 0,
            }}
          />
          {items.map((item) => {
            const selected = item.id === value;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={selected ? activeTabRef : undefined}
                id={tabId(item.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId(item.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(item.id)}
                className="tab"
              >
                {Icon ? <Icon size={15} strokeWidth={2} aria-hidden="true" /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="tabs-fade tabs-fade-start" data-visible={edges.start} aria-hidden="true" />
        <span className="tabs-fade tabs-fade-end" data-visible={edges.end} aria-hidden="true" />
      </div>

      <div
        ref={viewportRef}
        className="swipe-viewport"
        data-gesture-scroller
        data-dragging={dragging}
        data-measured={measured}
        style={box ? { height: box.height } : undefined}
        {...gesture.handlers}
      >
        <div className="swipe-track" style={{ transform: trackTransform }}>
          {items.map((item) => {
            const selected = item.id === value;
            return (
              <div
                key={item.id}
                ref={selected ? activePanelRef : undefined}
                id={panelId(item.id)}
                role="tabpanel"
                aria-labelledby={tabId(item.id)}
                tabIndex={0}
                inert={!selected}
                aria-hidden={!selected}
                className={`swipe-panel tab-panel ${panelClassName}`}
              >
                {panels[item.id]}
              </div>
            );
          })}
        </div>
      </div>

      {edges.overflowing ? (
        // Solo cuando de verdad quedan pestañas fuera de vista.
        <p className="lane-hint mt-1.5">Hay más secciones: desliza el carril.</p>
      ) : null}

      {/* Con teclado, activar una pestaña ya se anuncia; esto cubre el cambio
          por gesto, donde el foco no se mueve. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
