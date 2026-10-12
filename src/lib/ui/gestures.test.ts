import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GESTURE,
  clamp,
  filterOptions,
  firstMatchIndex,
  hasOverflow,
  isInteractiveTarget,
  isInsideHorizontalScroller,
  laneStep,
  normalizeText,
  overflowEdges,
  resolveGesture,
  resolveReveal,
  stepIndex,
  tabTargetIndex,
} from "./gestures.ts";

/* ------------------------------------------------------------------ ejes */

test("un gesto recto y largo hacia el lado es horizontal", () => {
  assert.equal(resolveGesture({ dx: 60, dy: 4, dt: 300 }), "horizontal");
  assert.equal(resolveGesture({ dx: -60, dy: 6, dt: 300 }), "horizontal");
});

test("un gesto vertical nunca se roba como horizontal", () => {
  assert.equal(resolveGesture({ dx: 6, dy: 60, dt: 300 }), "vertical");
  assert.equal(resolveGesture({ dx: 10, dy: 40, dt: 400 }), "vertical");
});

test("una diagonal se queda sin decidir hasta que un eje gana por proporción", () => {
  // 20 px laterales contra 18 verticales: 20 < 18 * 1.2 → todavía no.
  assert.equal(resolveGesture({ dx: 20, dy: 18, dt: 400 }), "none");
  // 30 contra 18: ya pasa la proporción.
  assert.equal(resolveGesture({ dx: 30, dy: 18, dt: 400 }), "horizontal");
});

test("un movimiento corto no decide nada", () => {
  assert.equal(resolveGesture({ dx: 6, dy: 2, dt: 200 }), "none");
});

test("un gesto corto pero rápido cuenta como horizontal (flick)", () => {
  assert.equal(resolveGesture({ dx: 14, dy: 8, dt: 16 }), "horizontal");
  assert.equal(resolveGesture({ dx: 5, dy: 12, dt: 16 }), "vertical");
});

test("la proporción mínima es la documentada", () => {
  assert.equal(GESTURE.ratio, 1.2);
});

/* --------------------------------------------------- controles protegidos */

test("el gesto no arranca sobre botones, enlaces, campos ni pestañas", () => {
  const inside = (selector: string) => ({
    closest: (asked: string) => (asked.includes(selector) ? {} : null),
  });
  for (const selector of ["button", "a[href]", "input", "textarea", "[role='tab']", "[role='switch']"]) {
    assert.equal(isInteractiveTarget(inside(selector)), true, selector);
  }
  assert.equal(isInteractiveTarget({ closest: () => null }), false);
});

test("un objetivo vacío o sin closest no rompe la comprobación", () => {
  assert.equal(isInteractiveTarget(null), false);
  assert.equal(isInteractiveTarget(undefined), false);
  assert.equal(isInteractiveTarget({}), false);
  assert.equal(
    isInteractiveTarget({
      closest: () => {
        throw new Error("selector inválido");
      },
    }),
    false,
  );
});

test("los carriles horizontales avisan con data-gesture-scroller", () => {
  const carril = {};
  const within = { closest: (asked: string) => (asked === "[data-gesture-scroller]" ? carril : null) };
  assert.equal(isInsideHorizontalScroller(within), true);
  assert.equal(isInsideHorizontalScroller({ closest: () => null }), false);
});

test("dueño del gesto: su propio marcador no lo bloquea, el de otro sí", () => {
  const propio = {};
  const dentro = { closest: () => propio };
  // Mismo elemento: el gesto es suyo (fila deslizable, panel de pestañas).
  assert.equal(isInsideHorizontalScroller(dentro, propio), false);
  // Marcador ajeno (un carril dentro del panel): la página no lo secuestra.
  assert.equal(isInsideHorizontalScroller(dentro, {}), true);
});

/* ------------------------------------------------------- revelar acciones */

test("soltar a media altura decide por la mitad del panel", () => {
  const width = 100;
  assert.equal(resolveReveal({ offset: -60, width, velocityX: 0 }), "open");
  assert.equal(resolveReveal({ offset: -20, width, velocityX: 0 }), "closed");
});

test("un flick rápido manda sobre la distancia", () => {
  assert.equal(resolveReveal({ offset: -8, width: 100, velocityX: -0.9 }), "open");
  assert.equal(resolveReveal({ offset: -92, width: 100, velocityX: 0.9 }), "closed");
});

test("el desplazamiento se recorta al ancho del panel", () => {
  // Un arrastre de 300 px sobre un panel de 84 px no revela de más.
  assert.equal(resolveReveal({ offset: -300, width: 84, velocityX: 0 }), "open");
  assert.equal(resolveReveal({ offset: 40, width: 84, velocityX: 0 }), "closed");
});

/* ------------------------------------------------- pestañas y navegación */

test("las flechas mueven el foco y dan la vuelta en los extremos", () => {
  assert.equal(tabTargetIndex(0, "ArrowRight", 4), 1);
  assert.equal(tabTargetIndex(3, "ArrowRight", 4), 0);
  assert.equal(tabTargetIndex(0, "ArrowLeft", 4), 3);
  assert.equal(tabTargetIndex(2, "Home", 4), 0);
  assert.equal(tabTargetIndex(2, "End", 4), 3);
  assert.equal(tabTargetIndex(2, "Enter", 4), null);
  assert.equal(tabTargetIndex(2, "Tab", 4), null);
});

test("sin vuelta, las flechas se detienen en los extremos", () => {
  assert.equal(tabTargetIndex(0, "ArrowLeft", 3, { loop: false }), 0);
  assert.equal(tabTargetIndex(2, "ArrowRight", 3, { loop: false }), 2);
});

test("en un grupo vacío no hay índice al que ir", () => {
  assert.equal(tabTargetIndex(0, "ArrowRight", 0), null);
  assert.equal(stepIndex(0, 1, 0), 0);
});

/* ------------------------------------------------------------- búsqueda */

test("la búsqueda ignora mayúsculas, acentos y espacios de sobra", () => {
  assert.equal(normalizeText("  Análisis  "), "analisis");
  assert.equal(normalizeText("BANCOS"), "bancos");
  assert.equal(normalizeText("Petróleos  Mexicanos"), "petroleos mexicanos");
});

test("filtrar opciones coincide con o sin acentos y por cualquier parte", () => {
  const options = ["Cementos Mexicanos", "Análisis técnico", "FIBRA Uno"];
  assert.deepEqual(filterOptions(options, "mex", (value) => value), ["Cementos Mexicanos"]);
  assert.deepEqual(filterOptions(options, "ANALISIS", (value) => value), ["Análisis técnico"]);
  assert.deepEqual(filterOptions(options, "  ", (value) => value), options);
});

test("la consulta vacía devuelve el catálogo, no una lista vacía", () => {
  const options = [{ ticker: "AAPL", title: "Apple Inc." }];
  assert.equal(filterOptions(options, "", (option) => option.title).length, 1);
});

test("se puede adelantar la primera opción que empieza con la consulta", () => {
  const options = ["Banco del Bajío", "Bancos", "Otro"];
  assert.equal(firstMatchIndex(options, "bancos", (value) => value), 1);
  assert.equal(firstMatchIndex(options, "", (value) => value), 0);
  assert.equal(firstMatchIndex([], "", (value) => value), -1);
});

/* ---------------------------------------------------------- carriles */

test("los indicadores de desbordamiento solo aparecen si hay contenido fuera", () => {
  assert.deepEqual(overflowEdges({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 }), {
    start: false,
    end: false,
  });
  assert.deepEqual(overflowEdges({ scrollLeft: 0, clientWidth: 300, scrollWidth: 700 }), {
    start: false,
    end: true,
  });
  assert.deepEqual(overflowEdges({ scrollLeft: 200, clientWidth: 300, scrollWidth: 700 }), {
    start: true,
    end: true,
  });
  assert.deepEqual(overflowEdges({ scrollLeft: 400, clientWidth: 300, scrollWidth: 700 }), {
    start: true,
    end: false,
  });
});

test("el margen de tolerancia evita parpadeos por redondeo", () => {
  assert.equal(hasOverflow({ clientWidth: 300, scrollWidth: 301 }), false);
  assert.equal(hasOverflow({ clientWidth: 300, scrollWidth: 320 }), true);
});

test("el paso del carril usa una tarjeta y, si no hay, el ancho visible", () => {
  assert.equal(laneStep(160, 320), 160);
  assert.equal(laneStep(0, 320), 256);
  assert.equal(laneStep(0, 100), 120);
});

/* ------------------------------------------------------------- utilidades */

test("clamp deja el valor dentro del rango", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(clamp(Number.NaN, 1, 3), 1);
});
