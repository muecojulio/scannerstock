import {
  Children,
  useCallback,
  useEffect,
  useRef,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { tabTargetIndex } from "@/lib/ui/gestures";
import { centerInTrack, laneScrollStep, useLaneEdges, usePrefersReducedMotion } from "@/lib/ui/hooks";

/**
 * Carriles horizontales con desplazamiento nativo.
 *
 * Nada de interruptores de gesto propios: el contenedor se desplaza como
 * cualquier lista del navegador (momentum incluido) y solo añadimos lo que
 * falta —`scroll-snap` moderado para no dejar tarjetas a medias, indicadores
 * de desbordamiento que aparecen únicamente cuando hay contenido fuera y
 * controles explícitos para quien no usa gestos—.
 *
 * La barra de desplazamiento se oculta visualmente, nunca la capacidad de
 * desplazarse, y los carriles se marcan con `data-gesture-scroller` para que
 * el gesto de cambiar de sección no los secuestre.
 */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type ChipOption = {
  value: string;
  label: string;
  icon?: IconComponent;
  /** Texto secundario opcional (p. ej. un conteo). */
  hint?: string;
};

/**
 * Carril de chips de selección única.
 *
 * Semántica de grupo de radios: `role="radiogroup"` con nombre accesible,
 * chips con `aria-checked`, paso del foco con flechas, Inicio y Fin. El estado
 * activo se marca con color, borde, halo y —cuando el chip lleva icono— el
 * icono de marca; nunca solo con color.
 */
export function ChipLane({
  options,
  value,
  onValueChange,
  label,
  className = "",
}: {
  options: readonly ChipOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Nombre accesible del grupo: "Filtros", "Modelos", "Tickers frecuentes". */
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const edges = useLaneEdges(trackRef, `${value}-${options.length}`);
  const behavior = usePrefersReducedMotion() ? "auto" : "smooth";

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const active = track.querySelector<HTMLElement>("[aria-checked='true']");
    if (!active) return;
    centerInTrack(track, active, behavior);
  }, [value, behavior]);

  const move = useCallback(
    (target: number) => {
      const option = options[target];
      if (!option) return;
      onValueChange(option.value);
      const track = trackRef.current;
      const buttons = track?.querySelectorAll<HTMLButtonElement>("[role='radio']");
      buttons?.[target]?.focus();
      buttons?.[target]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [onValueChange, options],
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((option) => option.value === value);
    if (current < 0) return;
    const target = tabTargetIndex(current, event.key, options.length);
    if (target === null) return;
    event.preventDefault();
    move(target);
  }

  return (
    <div className={`lane ${className}`}>
      <div
        ref={trackRef}
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="lane-track"
        data-gesture-scroller
      >
        {options.map((option) => {
          const selected = option.value === value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-active={selected}
              onClick={() => onValueChange(option.value)}
              className="chip lane-item"
            >
              {Icon ? <Icon size={14} strokeWidth={2} aria-hidden="true" /> : null}
              <span>{option.label}</span>
              {option.hint ? <span className="text-[0.6875rem] opacity-70">{option.hint}</span> : null}
            </button>
          );
        })}
      </div>
      <LaneFades edges={edges} />
      {edges.overflowing ? (
        <p className="lane-hint lane-hint-coarse mt-0.5" data-visible={edges.end}>
          Desliza para ver más opciones
        </p>
      ) : null}
    </div>
  );
}

/**
 * Carril de tarjetas. En el teléfono es un carrusel con asomo de la siguiente
 * tarjeta y `scroll-snap`; en pantalla grande el CSS lo convierte en
 * cuadrícula (ahí comparar en horizontal ya no aporta).
 */
export function Lane({
  label,
  items,
  className = "",
  showHint = true,
}: {
  /** Nombre accesible del carril, p. ej. "Lecturas recientes". */
  label: string;
  items: readonly ReactNode[];
  className?: string;
  showHint?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const edges = useLaneEdges(trackRef, `${items.length}`);
  const behavior = usePrefersReducedMotion() ? "auto" : "smooth";

  const scrollBy = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const first = track.firstElementChild as HTMLElement | null;
    const step = laneScrollStep(track, first ? first.getBoundingClientRect().width + 10 : 0);
    track.scrollBy({ left: direction * step, behavior });
  };

  return (
    <div className={`lane lane-cards ${className}`}>
      <div className="lane-header">
        <span className="text-xs tracking-wide text-stone">{label}</span>
        {edges.overflowing ? (
          <span className="lane-controls">
            <button
              type="button"
              className="lane-control"
              aria-label={`Ver anteriores en ${label}`}
              disabled={!edges.start}
              onClick={() => scrollBy(-1)}
            >
              <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="lane-control"
              aria-label={`Ver siguientes en ${label}`}
              disabled={!edges.end}
              onClick={() => scrollBy(1)}
            >
              <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
      <div ref={trackRef} className="lane-track" data-gesture-scroller>
        {Children.toArray(items).map((child, index) => (
          <div className="lane-item" key={index}>
            {child}
          </div>
        ))}
      </div>
      <LaneFades edges={edges} />
      {showHint && edges.overflowing ? (
        <p className="lane-hint lane-hint-coarse mt-0.5" data-visible={edges.end}>
          Desliza para ver el resto
        </p>
      ) : null}
    </div>
  );
}

/** Bordes difuminados: se encienden por lado, solo si hay contenido fuera. */
function LaneFades({ edges }: { edges: { start: boolean; end: boolean } }) {
  return (
    <>
      <span className="lane-fade lane-fade-start" data-visible={edges.start} aria-hidden="true" />
      <span className="lane-fade lane-fade-end" data-visible={edges.end} aria-hidden="true" />
    </>
  );
}

/** Fila de chips no seleccionables (acciones rápidas con estado). */
export function QuickChips({
  options,
  label,
  current,
  onSelect,
  className = "",
}: {
  options: readonly { value: string; label: string }[];
  label: string;
  /** Valor que coincide con el campo: se marca como actual, no como elegido. */
  current?: string;
  onSelect: (value: string) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const edges = useLaneEdges(trackRef, `${current ?? ""}-${options.length}`);

  return (
    <div className={`lane ${className}`}>
      <div ref={trackRef} className="lane-track" role="group" aria-label={label} data-gesture-scroller>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip lane-item"
            data-active={option.value === current}
            aria-current={option.value === current ? "true" : undefined}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <LaneFades edges={edges} />
    </div>
  );
}
