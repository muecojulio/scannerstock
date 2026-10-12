import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeQr, type QrCode } from "./encode.ts";
import {
  QR_BACKGROUND_COLOR,
  QR_MODULE_COLOR,
  QUIET_ZONE,
  qrModulesWithQuietZone,
  qrPathData,
  qrSvgMarkup,
  qrTextRows,
} from "./render.ts";

/** Un QR de mentira, cuadrado, con la matriz escrita a mano, para mirar el dibujo. */
function fakeCode(modules: boolean[][]): QrCode {
  const size = modules.length;
  return {
    text: "https://scannerstock.example/",
    ecc: "M",
    version: 1,
    size,
    mask: 0,
    modules,
  };
}

test("la zona de silencio rodea la matriz sin tocarla", () => {
  const code = encodeQr("https://scannerstock.example/", { ecc: "M" });
  const withQuiet = qrModulesWithQuietZone(code);
  assert.equal(withQuiet.length, code.size + QUIET_ZONE * 2);

  for (let i = 0; i < withQuiet.length; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, withQuiet.length - 1],
      [0, i],
      [withQuiet.length - 1, i],
    ] as const) {
      assert.equal(withQuiet[y]?.[x], false, `borde claro en (${x},${y})`);
    }
  }

  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      assert.equal(
        withQuiet[y + QUIET_ZONE]?.[x + QUIET_ZONE],
        code.modules[y]?.[x],
        `módulo (${x},${y}) intacto`,
      );
    }
  }
});

test("el camino SVG lleva un tramo por cada racha horizontal", () => {
  const code = fakeCode([
    [true, false],
    [false, true],
  ]);
  assert.equal(qrPathData(code, 0), "M0 0h1v1h-1zM1 1h1v1h-1z");
  // Una racha de módulos seguidos es un solo trazo, no uno por módulo.
  assert.equal(
    qrPathData(
      fakeCode([
        [true, true, true],
        [false, true, false],
        [true, false, true],
      ]),
      0,
    ),
    "M0 0h3v1h-3zM1 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1z",
  );
  assert.equal(
    qrPathData(
      fakeCode([
        [false, false],
        [false, false],
      ]),
      0,
    ),
    "",
  );
});

test("el camino crece con la matriz y respeta la zona de silencio", () => {
  const code = encodeQr("https://scannerstock.example/", { ecc: "Q" });
  const withoutQuiet = qrPathData(code, 0);
  const withQuiet = qrPathData(code, QUIET_ZONE);
  // Misma figura desplazada, no una figura distinta: cada trazo cuenta igual.
  assert.equal(withoutQuiet.split("M").length, withQuiet.split("M").length);
  assert.notEqual(withoutQuiet, withQuiet);
  assert.ok(withQuiet.startsWith(`M${QUIET_ZONE} ${QUIET_ZONE}`));
});

test("el SVG se puede descargar: tamaño, fondo, color y etiqueta", () => {
  const code = encodeQr("https://scannerstock.example/", { ecc: "M" });
  const total = code.size + QUIET_ZONE * 2;
  const svg = qrSvgMarkup(code);

  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, new RegExp(`width="${total * 8}" height="${total * 8}"`));
  assert.match(svg, new RegExp(`viewBox="0 0 ${total} ${total}"`));
  assert.match(svg, new RegExp(`<rect width="${total}" height="${total}" fill="${QR_BACKGROUND_COLOR}"/>`));
  assert.match(svg, new RegExp(`fill="${QR_MODULE_COLOR}" shape-rendering="crispEdges"`));
  assert.match(svg, /role="img"/);
  assert.ok(svg.endsWith("</svg>\n"));
});

test("el SVG escapa lo que le llega en el texto", () => {
  const code = encodeQr('https://ejemplo.example/?q=<script>&"x"', { ecc: "L" });
  // La etiqueta por defecto lleva el propio texto codificado.
  const svg = qrSvgMarkup(code);
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&amp;&quot;x&quot;"));

  const custom = qrSvgMarkup(code, { title: 'Ataque <&"> </svg>' });
  assert.ok(custom.includes("Ataque &lt;&amp;&quot;&gt; &lt;/svg&gt;"));
});

test("el texto plano de la matriz sirve para inspeccionarla", () => {
  const code = fakeCode([
    [true, false, true],
    [false, true, false],
    [true, false, false],
  ]);
  assert.deepEqual(qrTextRows(code), ["#.#", ".#.", "#.."]);
  assert.deepEqual(qrTextRows(code, 1), [".....", ".#.#.", "..#..", ".#...", "....."]);
});
