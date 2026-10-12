/**
 * Reglas puras de gesto, foco y filtrado que comparten los componentes de
 * interfaz (`src/components/ui/*`).
 *
 * Están aquí —y no dentro de cada componente— por dos razones: son la parte
 * que de verdad decide *si* un gesto cambia de sección (y por tanto la que
 * puede arruinar el scroll vertical del usuario) y se pueden probar sin DOM
 * (`gestures.test.ts`).
 *
 * Criterios deliberados:
 *
 *   - Se distingue un gesto horizontal de uno vertical por proporción, no por
 *     el primer movimiento: el dedo casi nunca arranca recto. Umbral 1.2.
 *   - Un gesto corto y rápido cuenta como gesto aunque no llegue a la
 *     distancia mínima (flick), que es como se comportan los carruseles
 *     nativos.
 *   - Nada decide mientras el eje no esté claro: devolver `"none"` es
 *     correcto y deja que el navegador siga con su scroll.
 */

/** Eje dominante de un gesto. */
export type GestureAxis = "horizontal" | "vertical" | "none";

/** Umbrales del sistema, en píxeles y milisegundos. */
export const GESTURE = {
  /** Distancia mínima recorrida para declarar un eje. */
  distance: 12,
  /** Cuántas veces debe superar el desplazamiento lateral al vertical. */
  ratio: 1.2,
  /** Velocidad (px/ms) que basta por sí sola para declarar el eje. */
  velocity: 0.5,
  /** Velocidad (px/ms) que abre o cierra una fila sin llegar al umbral. */
  flick: 0.45,
  /** Fracción del ancho de acciones a la que se abre con el gesto lento. */
  revealThreshold: 0.42,
} as const;

/** Selectores que nunca inician un gesto de la aplicación. */
export const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='tab']",
  "[role='radio']",
  "[role='switch']",
  "[role='combobox']",
  "[role='option']",
  "[role='link']",
  "[role='slider']",
  "[role='spinbutton']",
  "[contenteditable='true']",
  "[data-no-gesture]",
].join(",");

/** Nada que ver con el DOM: solo lo que se puede calcular. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Eje del gesto tras `dx`/`dy` píxeles y `dt` milisegundos.
 *
 * `"none"` significa "todavía no se sabe": quien consuma el gesto debe
 * esperar, no cancelar el scroll ni mover nada.
 */
export function resolveGesture(input: { dx: number; dy: number; dt: number }): GestureAxis {
  const dx = input.dx;
  const dy = input.dy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const dt = input.dt > 0 ? input.dt : 16;
  const vx = adx / dt;
  const vy = ady / dt;

  const lateralLong = adx >= GESTURE.distance && adx >= ady * GESTURE.ratio;
  const lateralFast = vx >= GESTURE.velocity && adx > ady;
  const verticalLong = ady >= GESTURE.distance && ady >= adx * GESTURE.ratio;
  const verticalFast = vy >= GESTURE.velocity && ady > adx;

  if (lateralLong || lateralFast) return "horizontal";
  if (verticalLong || verticalFast) return "vertical";
  return "none";
}

/**
 * ¿El gesto empezó sobre un control? Botones, enlaces, campos, pestañas y
 * carriles ajenos conservan su comportamiento: el gesto no los secuestra.
 *
 * Se comprueba con `closest`, así que sirve cualquier ancestro, y se acepta
 * cualquier objeto con esa función para poder probarlo sin DOM.
 */
export function isInteractiveTarget(target: unknown): boolean {
  const node = target as { closest?: (selector: string) => unknown } | null | undefined;
  if (!node || typeof node.closest !== "function") return false;
  try {
    return node.closest(INTERACTIVE_SELECTOR) !== null;
  } catch {
    return false;
  }
}

/**
 * ¿El gesto empezó dentro de una región que se queda con el gesto horizontal
 * (un carril, una lista de pestañas, una fila deslizable)?
 *
 * `owner` es el elemento que está escuchando el gesto. Si el marcador que se
 * encuentra es precisamente ese elemento, el gesto es suyo y no se descarta:
 * así una fila deslizable o un panel de pestañas siguen respondiendo a su
 * propio gesto, mientras que la página (cuyo marcador no aparece ahí) no se
 * entromete.
 */
export function isInsideHorizontalScroller(target: unknown, owner?: unknown): boolean {
  const node = target as { closest?: (selector: string) => unknown } | null | undefined;
  if (!node || typeof node.closest !== "function") return false;
  try {
    const scroller = node.closest("[data-gesture-scroller]");
    if (scroller === null || scroller === undefined) return false;
    return scroller !== owner;
  } catch {
    return false;
  }
}

/**
 * Resultado de soltar una fila deslizada: ¿se queda abierta o vuelve?
 *
 * `offset` es el desplazamiento actual (negativo = hacia la izquierda, que es
 * como se revelan las acciones). Un gesto rápido manda sobre la distancia;
 * un gesto lento se decide por la mitad del panel.
 */
export function resolveReveal(input: {
  offset: number;
  width: number;
  velocityX: number;
  threshold?: number;
  flick?: number;
}): "open" | "closed" {
  const width = Math.max(1, input.width);
  const revealed = clamp(-input.offset, 0, width);
  const flick = input.flick ?? GESTURE.flick;
  if (input.velocityX <= -flick) return "open";
  if (input.velocityX >= flick) return "closed";
  const threshold = (input.threshold ?? GESTURE.revealThreshold) * width;
  return revealed >= threshold ? "open" : "closed";
}

/** Índice siguiente con vuelta al principio (o tope en los extremos). */
export function stepIndex(current: number, delta: number, total: number, loop = true): number {
  if (total <= 0) return 0;
  if (!loop) return clamp(current + delta, 0, total - 1);
  return (current + delta + total) % total;
}

/**
 * Índice al que apunta una tecla en un grupo de pestañas, chips o pestañas de
 * navegación (patrón APG: flechas, Inicio y Fin). `null` = tecla que no mueve.
 */
export function tabTargetIndex(
  current: number,
  key: string,
  total: number,
  options: { rtl?: boolean; loop?: boolean } = {},
): number | null {
  if (total <= 0) return null;
  const loop = options.loop ?? true;
  const forward = options.rtl ? "ArrowLeft" : "ArrowRight";
  const backward = options.rtl ? "ArrowRight" : "ArrowLeft";
  switch (key) {
    case forward:
      return stepIndex(current, 1, total, loop);
    case backward:
      return stepIndex(current, -1, total, loop);
    case "Home":
      return 0;
    case "End":
      return total - 1;
    default:
      return null;
  }
}

/**
 * Texto normalizado para buscar: sin mayúsculas, sin acentos y sin espacios
 * de sobra. "Análisis" y "analisis" deben coincidir.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filtra opciones mientras se escribe. La consulta vacía no filtra: mostrar el
 * catálogo completo al abrir es más útil que una lista vacía.
 */
export function filterOptions<T>(options: readonly T[], query: string, toText: (option: T) => string): T[] {
  const needle = normalizeText(query);
  if (!needle) return [...options];
  return options.filter((option) => normalizeText(toText(option)).includes(needle));
}

/** Índice de la primera opción que empieza con la consulta (para adelantar). */
export function firstMatchIndex<T>(
  options: readonly T[],
  query: string,
  toText: (option: T) => string,
): number {
  const needle = normalizeText(query);
  if (!needle) return options.length > 0 ? 0 : -1;
  return options.findIndex((option) => normalizeText(toText(option)).startsWith(needle));
}

/** ¿Hay contenido oculto a cada lado del carril? */
export function overflowEdges(input: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  tolerance?: number;
}): { start: boolean; end: boolean } {
  const tolerance = input.tolerance ?? 2;
  const max = Math.max(0, input.scrollWidth - input.clientWidth);
  const offset = clamp(input.scrollLeft, 0, max);
  return {
    start: offset > tolerance,
    end: offset < max - tolerance,
  };
}

/** ¿Cabe todo? Si sí, no se muestran indicadores de desbordamiento. */
export function hasOverflow(input: { clientWidth: number; scrollWidth: number; tolerance?: number }): boolean {
  const tolerance = input.tolerance ?? 2;
  return input.scrollWidth - input.clientWidth > tolerance;
}

/** Tamaño de paso del carril: una tarjeta medida, o el ancho visible. */
export function laneStep(itemExtent: number, clientWidth: number): number {
  if (itemExtent > 0) return itemExtent;
  return Math.max(clientWidth * 0.8, 120);
}
