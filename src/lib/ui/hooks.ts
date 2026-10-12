/**
 * Hooks compartidos del sistema de interacciones (`src/components/ui/*`).
 *
 * Todos siguen las mismas reglas:
 *   - Nada de `matchMedia` durante el render: el HTML del servidor y el del
 *     cliente tienen que coincidir. Las preferencias (movimiento reducido,
 *     puntero fino) se leen dentro de efectos y solo cambian *cómo* se
 *     comporta un gesto, nunca *qué* se pinta al hidratar.
 *   - Los listeners se registran una vez y leen las opciones actuales por
 *     referencia (`useLatest`), así un componente que se re-renderiza no
 *     reengancha gestos a mitad de un arrastre.
 *   - Todo lo decorativo se apaga con `prefers-reduced-motion`, pero los
 *     estados (cargando, listo, error) siguen existiendo.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  clamp,
  hasOverflow,
  isInsideHorizontalScroller,
  isInteractiveTarget,
  laneStep,
  overflowEdges,
  resolveGesture,
  type GestureAxis,
} from "./gestures";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Valor más reciente sin volver a crear callbacks. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/* ------------------------------------------------------------------ medios */

/** `true` solo en cliente y solo si el sistema pide menos movimiento. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Desplazamiento suave salvo que el sistema lo prohíba. */
export function useScrollBehavior(): ScrollBehavior {
  return usePrefersReducedMotion() ? "auto" : "smooth";
}

/* ------------------------------------------------------------ medir cajas */

export type IndicatorBox = { x: number; y: number; width: number; height: number };

/** Asas internas del temporizador de rAF (una por hook). */
type Raft = { frame: number };

/** Reintenta la medida en el siguiente cuadro: útil tras un cambio de layout. */
function measureSoon(run: () => void, raft: Raft): void {
  if (raft.frame) cancelAnimationFrame(raft.frame);
  raft.frame = requestAnimationFrame(() => {
    raft.frame = 0;
    run();
  });
}

/**
 * Posición y tamaño del elemento activo dentro de un contenedor (en
 * coordenadas del contenido, es decir contando su desplazamiento).
 *
 * Se usa para mover la píldora de las pestañas y del navegador inferior como
 * un solo elemento que se desliza, en vez de recolorear cada opción.
 */
export function useIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeRef: RefObject<HTMLElement | null>,
  key: string,
): IndicatorBox | null {
  const [box, setBox] = useState<IndicatorBox | null>(null);
  const raft = useRef<Raft>({ frame: 0 }).current;

  const measure = useCallback(() => {
    const container = containerRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const next: IndicatorBox = {
      x: activeRect.left - containerRect.left + container.scrollLeft,
      y: activeRect.top - containerRect.top + container.scrollTop,
      width: activeRect.width,
      height: activeRect.height,
    };
    setBox((current) =>
      current &&
      Math.abs(current.x - next.x) < 0.5 &&
      Math.abs(current.y - next.y) < 0.5 &&
      Math.abs(current.width - next.width) < 0.5 &&
      Math.abs(current.height - next.height) < 0.5
        ? current
        : next,
    );
  }, [containerRef, activeRef]);

  useIsomorphicLayoutEffect(() => {
    measureSoon(measure, raft);
  }, [measure, key, raft]);

  useEffect(() => {
    const container = containerRef.current;
    const active = activeRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measureSoon(measure, raft));
    observer.observe(container);
    if (active) observer.observe(active);
    window.addEventListener("resize", measure, { passive: true });
    // Las tipografías cambian el ancho de la opción activa al cargar.
    void document.fonts?.ready.then(() => measureSoon(measure, raft));
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      if (raft.frame) cancelAnimationFrame(raft.frame);
    };
    // `key` cambia cuando cambia el elemento activo: hay que volver a observar.
  }, [containerRef, activeRef, measure, raft, key]);

  return box;
}

/* ----------------------------------------------------------- desbordamiento */

export type LaneEdges = { start: boolean; end: boolean; overflowing: boolean };

/**
 * Estado de desbordamiento de un carril: qué lados tienen contenido oculto.
 * Se recalcula al desplazar y al cambiar el tamaño, con tolerancia para que
 * los bordes no parpadeen por redondeos subpíxel.
 */
export function useLaneEdges(trackRef: RefObject<HTMLElement | null>, key: string) {
  const [state, setState] = useState<LaneEdges>({ start: false, end: false, overflowing: false });

  const update = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const edges = overflowEdges({
      scrollLeft: track.scrollLeft,
      clientWidth: track.clientWidth,
      scrollWidth: track.scrollWidth,
    });
    const overflowing = hasOverflow({ clientWidth: track.clientWidth, scrollWidth: track.scrollWidth });
    setState((current) =>
      current.start === edges.start && current.end === edges.end && current.overflowing === overflowing
        ? current
        : { ...edges, overflowing },
    );
  }, [trackRef]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    for (const child of Array.from(track.children)) observer.observe(child);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      track.removeEventListener("scroll", update);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [trackRef, update, key]);

  return { ...state, update };
}

/* ---------------------------------------------------------------- gestos */

export type SwipeRelease = { offset: number; velocityX: number; width: number };

export type SwipeGestureOptions = {
  /** Desactiva el gesto sin desmontar los manejadores (p. ej. en escritorio). */
  enabled?: boolean;
  /** Desplazamiento desde el que arranca el arrastre (una fila abierta: -width). */
  startOffset?: () => number;
  /** Recorte del desplazamiento (normalmente 0 … -width). */
  clampOffset?: (offset: number) => number;
  /** Ancho del panel de acciones, informado en el evento de soltado. */
  panelWidth?: () => number;
  onDragStart?: () => void;
  onDrag?: (offset: number) => void;
  onRelease?: (state: SwipeRelease) => void;
  onCancel?: () => void;
  /** Tipos de puntero que inician el gesto. El ratón se excluye por defecto. */
  pointerTypes?: readonly string[];
};

type SwipeState = {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  offset: number;
  axis: GestureAxis;
  moved: boolean;
};

const IDLE_SWIPE: SwipeState = {
  active: false,
  pointerId: -1,
  startX: 0,
  startY: 0,
  startTime: 0,
  lastX: 0,
  lastTime: 0,
  velocityX: 0,
  offset: 0,
  axis: "none",
  moved: false,
};

/**
 * Gesture de arrastre horizontal con bloqueo de eje.
 *
 * - No emite nada hasta que el eje está claro: mientras el dedo va vertical,
 *   el navegador se queda con el scroll de la página.
 * - No arranca sobre botones, enlaces, campos ni carriles ajenos.
 * - Al soltar, informa desplazamiento y velocidad para que el consumidor
 *   decida (abrir/cerrar una fila, cambiar de pestaña).
 * - Después de un arrastre real, el clic siguiente se descarta: mover la fila
 *   no debe activar la tarjeta.
 *
 * Requiere `touch-action: pan-y` en el elemento (así el navegador conserva el
 * scroll vertical y nos cede el horizontal).
 */
export function useSwipeGesture(options: SwipeGestureOptions) {
  const opts = useLatest(options);
  const state = useRef<SwipeState>({ ...IDLE_SWIPE });
  const suppressClick = useRef(false);
  const clearTimer = useRef(0);
  const [dragging, setDragging] = useState(false);

  // Al desmontar solo hay que soltar el temporizador del clic suprimido: el
  // estado del gesto vive en una referencia y desaparece con el componente.
  useEffect(() => {
    return () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, []);

  const finish = useCallback(
    (release: boolean) => {
      const current = state.current;
      if (!current.active) return;
      const { offset, velocityX, axis, moved } = current;
      state.current = { ...IDLE_SWIPE };
      setDragging(false);
      if (axis !== "horizontal") {
        opts.current.onCancel?.();
        return;
      }
      opts.current.onRelease?.({ offset, velocityX, width: opts.current.panelWidth?.() ?? 0 });
      if (release && moved) {
        // El clic posterior a un arrastre no debe activar la tarjeta.
        suppressClick.current = true;
        if (clearTimer.current) window.clearTimeout(clearTimer.current);
        clearTimer.current = window.setTimeout(() => {
          suppressClick.current = false;
          clearTimer.current = 0;
        }, 400);
      }
    },
    [opts],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = opts.current;
      if (current.enabled === false) return;
      const allowed = current.pointerTypes ?? ["touch", "pen"];
      if (!allowed.includes(event.pointerType)) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (isInteractiveTarget(event.target)) return;
      if (isInsideHorizontalScroller(event.target, event.currentTarget)) return;
      if (state.current.active) return;
      state.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: event.timeStamp,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocityX: 0,
        offset: current.startOffset?.() ?? 0,
        axis: "none",
        moved: false,
      };
    },
    [opts],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = state.current;
      const config = opts.current;
      if (!current.active || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const dt = event.timeStamp - current.startTime;

      if (current.axis === "none") {
        const axis = resolveGesture({ dx, dy, dt });
        if (axis === "none") return;
        current.axis = axis;
        if (axis === "vertical") {
          // El navegador se queda con el scroll: no tocamos nada más.
          finish(false);
          return;
        }
        setDragging(true);
        config.onDragStart?.();
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          /* el puntero ya se liberó */
        }
      }

      const sample = event.timeStamp - current.lastTime;
      if (sample > 0) {
        const instant = (event.clientX - current.lastX) / sample;
        current.velocityX = current.velocityX * 0.6 + instant * 0.4;
      }
      current.lastX = event.clientX;
      current.lastTime = event.timeStamp;

      const raw = (config.startOffset?.() ?? 0) + dx;
      const offset = config.clampOffset ? config.clampOffset(raw) : raw;
      current.offset = offset;
      if (Math.abs(dx) > 6) current.moved = true;
      config.onDrag?.(offset);
    },
    [finish, opts],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!state.current.active || event.pointerId !== state.current.pointerId) return;
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* nunca se capturó */
      }
      finish(true);
    },
    [finish],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!state.current.active || event.pointerId !== state.current.pointerId) return;
      finish(false);
    },
    [finish],
  );

  /** Descarta el clic que sigue a un arrastre (no activa controles por error). */
  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handlers = useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture],
  );

  return { handlers, dragging, wasDragged: () => suppressClick.current };
}

/* ------------------------------------------------------------ estado acción */

export type ActionStatus = "idle" | "loading" | "success" | "error";

export type ActionStatusController = {
  status: ActionStatus;
  /** Marca "cargando" y cancela cualquier temporizador pendiente. */
  start: () => void;
  succeed: () => void;
  fail: () => void;
  reset: () => void;
  /** `true` mientras corre la acción: bloquea envíos duplicados. */
  busy: boolean;
};

/**
 * Estados de una acción (inactivo, cargando, éxito, error) con vuelta
 * automática al estado normal. El éxito y el error se anuncian también por
 * lector de pantalla desde el componente que lo use.
 */
export function useActionStatus(options?: { successMs?: number; errorMs?: number }): ActionStatusController {
  const successMs = options?.successMs ?? 1800;
  const errorMs = options?.errorMs ?? 4000;
  const [status, setStatus] = useState<ActionStatus>("idle");
  const timer = useRef(0);
  const latest = useLatest({ successMs, errorMs });

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
  }, []);

  const schedule = useCallback(
    (next: Exclude<ActionStatus, "idle" | "loading">) => {
      clear();
      timer.current = window.setTimeout(
        () => {
          timer.current = 0;
          setStatus("idle");
        },
        next === "success" ? latest.current.successMs : latest.current.errorMs,
      );
    },
    [clear, latest],
  );

  useEffect(() => clear, [clear]);

  return {
    status,
    busy: status === "loading",
    start: useCallback(() => {
      clear();
      setStatus("loading");
    }, [clear]),
    succeed: useCallback(() => {
      setStatus("success");
      schedule("success");
    }, [schedule]),
    fail: useCallback(() => {
      setStatus("error");
      schedule("error");
    }, [schedule]),
    reset: useCallback(() => {
      clear();
      setStatus("idle");
    }, [clear]),
  };
}

/* ------------------------------------------------------------- visibilidad */

/**
 * Visibilidad en pantalla.
 *
 * Devuelve `{ visible, ready }`. `ready` es importante: mientras sea `false`
 * nadie debería esconder el contenido, porque el HTML servidor y el primer
 * render del cliente tienen que coincidir y, si el JavaScript no llegara a
 * ejecutarse, la página debe verse igual. El estado "fuera de pantalla" se
 * arma después de montar, cuando el observador ya informó.
 */
export function useInView<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options?: { once?: boolean; rootMargin?: string; disabled?: boolean },
): { visible: boolean; ready: boolean } {
  const { once = true, rootMargin = "0px 0px -8% 0px", disabled = false } = options ?? {};
  const [state, setState] = useState({ visible: false, ready: false });
  const opts = useLatest({ once });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (disabled || typeof IntersectionObserver === "undefined") {
      setState({ visible: true, ready: true });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState({ visible: true, ready: true });
            if (opts.current.once) observer.disconnect();
          } else if (!opts.current.once) {
            setState({ visible: false, ready: true });
          } else {
            setState((current) => (current.ready ? current : { visible: false, ready: true }));
          }
        }
      },
      { rootMargin, threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin, disabled, opts]);

  return state;
}

/* --------------------------------------------------------------- diálogos */

/** Cierra al tocar fuera (y al salir de la ventana), sin robar el foco. */
export function useOutsidePointer(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled = true,
): void {
  const handler = useLatest(onOutside);
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const onPointerDown = (event: Event) => {
      const node = ref.current;
      if (!node) return;
      if (event.target instanceof Node && node.contains(event.target)) return;
      handler.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [ref, enabled, handler]);
}

/* -------------------------------------------------------------- carriles */

/** Paso de desplazamiento de un carril: una tarjeta, o el ancho visible. */
export function laneScrollStep(track: HTMLElement, itemExtent?: number): number {
  return laneStep(itemExtent ?? 0, track.clientWidth);
}

/** Centra un elemento dentro de su carril sin mover la página. */
export function centerInTrack(track: HTMLElement, child: HTMLElement, behavior: ScrollBehavior): void {
  const left = child.offsetLeft - Math.max(0, (track.clientWidth - child.clientWidth) / 2);
  track.scrollTo({ left: clamp(left, 0, Math.max(0, track.scrollWidth - track.clientWidth)), behavior });
}

/** Mueve el carril un paso (una tarjeta) y actualiza sus indicadores. */
export function scrollLaneBy(track: HTMLElement, direction: -1 | 1, behavior: ScrollBehavior): void {
  track.scrollBy({ left: direction * laneScrollStep(track), behavior });
}
