import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  alignmentPositions,
  dataCodewords,
  encodeQr,
  formatBits,
  utf8Bytes,
  versionBits,
  type EccLevel,
  type QrCode,
} from "./encode.ts";
import { qrTextRows } from "./render.ts";

/**
 * Vectores de referencia: hash SHA-256 (16 primeros dígitos) de la matriz
 * completa —filas de `#` y `.` unidas por saltos de línea— calculada con la
 * implementación `qrcode@1.5.4` en **modo byte**, que es el que usa el codificador.
 *
 * Son la prueba de que esto no es «un QR que se parece»: un implementación
 * independiente y muy extendida produce exactamente la misma matriz, con la
 * misma versión y la misma máscara. Si algún día un cambio mueve un solo
 * módulo, esta tabla lo dice.
 */
const VECTORS: ReadonlyArray<{ name: string; ecc: EccLevel; version: number; mask: number | "auto"; hash: string }> = [
  { name: "corta", ecc: "L", version: 2, mask: "auto", hash: "80ae8556b29b9176" },
  { name: "corta", ecc: "M", version: 3, mask: "auto", hash: "57be6220f2c044a1" },
  { name: "corta", ecc: "Q", version: 3, mask: "auto", hash: "552f8b92b4ff2ed4" },
  { name: "corta", ecc: "H", version: 4, mask: "auto", hash: "d2743198afd2e123" },
  { name: "media", ecc: "L", version: 3, mask: "auto", hash: "90eb2f369ccf4af2" },
  { name: "media", ecc: "M", version: 3, mask: "auto", hash: "e48c77db9c3f879b" },
  { name: "media", ecc: "Q", version: 4, mask: "auto", hash: "f7338c0a414f3460" },
  { name: "media", ecc: "H", version: 4, mask: "auto", hash: "6dd12c08713130bc" },
  { name: "acentos", ecc: "L", version: 4, mask: "auto", hash: "e649ac8e54f47f73" },
  { name: "acentos", ecc: "M", version: 5, mask: "auto", hash: "6fd82db4cc8f452b" },
  { name: "acentos", ecc: "Q", version: 7, mask: "auto", hash: "dc1751b015410dfd" },
  { name: "acentos", ecc: "H", version: 8, mask: "auto", hash: "aa089e65cba16fba" },
  { name: "larga", ecc: "L", version: 5, mask: "auto", hash: "d38c1c9d5737ce76" },
  { name: "larga", ecc: "M", version: 6, mask: "auto", hash: "84bb3213592c9608" },
  { name: "larga", ecc: "Q", version: 8, mask: "auto", hash: "ce804ebae94e9922" },
  { name: "larga", ecc: "H", version: 9, mask: "auto", hash: "f2c593a52b9af91b" },
  { name: "muy larga", ecc: "L", version: 15, mask: "auto", hash: "a9e1ccfcbe1148aa" },
  { name: "muy larga", ecc: "M", version: 17, mask: "auto", hash: "20fcf3628be71b64" },
  { name: "muy larga", ecc: "Q", version: 20, mask: "auto", hash: "d142303f2071a7ca" },
  { name: "muy larga", ecc: "H", version: 24, mask: "auto", hash: "6cdce77ce861d268" },
  { name: "forzada-L-0", ecc: "L", version: 3, mask: 0, hash: "306e6dc468764a20" },
  { name: "forzada-L-1", ecc: "L", version: 3, mask: 1, hash: "3d651aaed9f2ffb3" },
  { name: "forzada-L-2", ecc: "L", version: 3, mask: 2, hash: "51f2769312319c64" },
  { name: "forzada-L-3", ecc: "L", version: 3, mask: 3, hash: "09d3a3cdbc6e59d4" },
  { name: "forzada-L-4", ecc: "L", version: 3, mask: 4, hash: "9dc7fd384e73721f" },
  { name: "forzada-L-5", ecc: "L", version: 3, mask: 5, hash: "d6d91aecc3b54808" },
  { name: "forzada-L-6", ecc: "L", version: 3, mask: 6, hash: "449331799c76eeaa" },
  { name: "forzada-L-7", ecc: "L", version: 3, mask: 7, hash: "90eb2f369ccf4af2" },
  { name: "forzada-M-0", ecc: "M", version: 3, mask: 0, hash: "1460e4253239fa10" },
  { name: "forzada-M-1", ecc: "M", version: 3, mask: 1, hash: "f2a1ab32aab878b3" },
  { name: "forzada-M-2", ecc: "M", version: 3, mask: 2, hash: "e48c77db9c3f879b" },
  { name: "forzada-M-3", ecc: "M", version: 3, mask: 3, hash: "62cb9171c793fcba" },
  { name: "forzada-M-4", ecc: "M", version: 3, mask: 4, hash: "1d6e94eaa7f411da" },
  { name: "forzada-M-5", ecc: "M", version: 3, mask: 5, hash: "4fcf6d7976b9f2ea" },
  { name: "forzada-M-6", ecc: "M", version: 3, mask: 6, hash: "76c4227ff87b84cf" },
  { name: "forzada-M-7", ecc: "M", version: 3, mask: 7, hash: "cb4723000479edda" },
  { name: "forzada-Q-0", ecc: "Q", version: 4, mask: 0, hash: "5b6dc0869940ff8c" },
  { name: "forzada-Q-1", ecc: "Q", version: 4, mask: 1, hash: "eb96aca0d53559ef" },
  { name: "forzada-Q-2", ecc: "Q", version: 4, mask: 2, hash: "ff115d6f9184da81" },
  { name: "forzada-Q-3", ecc: "Q", version: 4, mask: 3, hash: "4f40b5b96e4d6eb5" },
  { name: "forzada-Q-4", ecc: "Q", version: 4, mask: 4, hash: "20e67e61c7884e38" },
  { name: "forzada-Q-5", ecc: "Q", version: 4, mask: 5, hash: "f396457cea39054c" },
  { name: "forzada-Q-6", ecc: "Q", version: 4, mask: 6, hash: "f7338c0a414f3460" },
  { name: "forzada-Q-7", ecc: "Q", version: 4, mask: 7, hash: "b3b79e5213045eab" },
  { name: "forzada-H-0", ecc: "H", version: 4, mask: 0, hash: "63709ac66fe8aa4d" },
  { name: "forzada-H-1", ecc: "H", version: 4, mask: 1, hash: "cb6ee9dd8636dd95" },
  { name: "forzada-H-2", ecc: "H", version: 4, mask: 2, hash: "2a31c6fec6651810" },
  { name: "forzada-H-3", ecc: "H", version: 4, mask: 3, hash: "011fc8fa9c67f0ec" },
  { name: "forzada-H-4", ecc: "H", version: 4, mask: 4, hash: "6dd12c08713130bc" },
  { name: "forzada-H-5", ecc: "H", version: 4, mask: 5, hash: "bffd4615955d8b7a" },
  { name: "forzada-H-6", ecc: "H", version: 4, mask: 6, hash: "5e58e7e5d9e51290" },
  { name: "forzada-H-7", ecc: "H", version: 4, mask: 7, hash: "a4a79255ce76f026" },
];

const TEXTS: Record<string, string> = {
  corta: "https://scannerstock.example/",
  media: "https://8080-abc123def456.e2b.app/",
  acentos: "ScannerStock · diagnóstico fundamental estricto — árbol, diseño, ¿qué?",
  larga: "https://ejemplo.muy.largo.subdominio.example.com/ruta/que/va/lejos?con=parametros&mas=1#fragmento",
  "muy larga": "https://scannerstock.example/informe?ticker=AAPL&modelo=1&fecha=2026-10-12&" + "x".repeat(400),
};

function matrixHash(code: QrCode): string {
  return createHash("sha256").update(qrTextRows(code).join("\n")).digest("hex").slice(0, 16);
}

test("la versión es la menor que cabe y el tamaño sale de ella", () => {
  const short = encodeQr("https://a.example/", { ecc: "L" });
  assert.equal(short.version, 2);
  assert.equal(short.size, short.version * 4 + 17);
  assert.equal(short.modules.length, short.size);
  assert.equal(short.modules[0]?.length, short.size);

  // Un texto más largo no cabe donde el corto: sube de versión, no de nivel.
  const long = encodeQr("https://a.example/" + "x".repeat(200), { ecc: "L" });
  assert.ok(long.version > short.version);
  assert.equal(long.ecc, "L");
});

test("los patrones de función están donde manda la norma", () => {
  const code = encodeQr("https://scannerstock.example/", { ecc: "Q" });
  const { modules, size } = code;

  // Patrón de localización: anillo oscuro, hueco claro y núcleo oscuro.
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const expected = Math.max(Math.abs(dx), Math.abs(dy)) !== 2;
        assert.equal(modules[cy + dy]?.[cx + dx], expected, `localización en (${cx + dx},${cy + dy})`);
      }
    }
    // Separador claro: el anillo a distancia 4.
    for (let d = -4; d <= 4; d++) {
      for (const [x, y] of [[cx + d, cy - 4], [cx + d, cy + 4], [cx - 4, cy + d], [cx + 4, cy + d]] as const) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        assert.equal(modules[y]?.[x], false, `separador en (${x},${y})`);
      }
    }
  }

  // Patrones de tiempo: fila 6 y columna 6 alternando desde el origen.
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6]?.[i], i % 2 === 0, `tiempo horizontal en ${i}`);
    assert.equal(modules[i]?.[6], i % 2 === 0, `tiempo vertical en ${i}`);
  }

  // Módulo oscuro fijo, siempre encendido.
  assert.equal(modules[size - 8]?.[8], true);
});

test("la información de formato dice el nivel y la máscara que se usaron", () => {
  for (const ecc of ["L", "M", "Q", "H"] as const) {
    const code = encodeQr("https://scannerstock.example/", { ecc });
    const bits = formatBits(ecc, code.mask);
    const bit = (index: number) => ((bits >>> index) & 1) !== 0;
    const size = code.size;

    for (let i = 0; i <= 5; i++) assert.equal(code.modules[i]?.[8], bit(i), `formato vertical ${i}`);
    assert.equal(code.modules[7]?.[8], bit(6));
    assert.equal(code.modules[8]?.[8], bit(7));
    assert.equal(code.modules[8]?.[7], bit(8));
    for (let i = 9; i < 15; i++) assert.equal(code.modules[8]?.[14 - i], bit(i), `formato horizontal ${i}`);
    for (let i = 0; i < 8; i++) assert.equal(code.modules[8]?.[size - 1 - i], bit(i), `formato inferior ${i}`);
  }
});

test("la versión, la alineación y la información de versión siguen la norma", () => {
  // Tabla 7 de la norma: codewords de datos que deja cada versión.
  assert.equal(dataCodewords(1, "L"), 19);
  assert.equal(dataCodewords(1, "H"), 9);
  assert.equal(dataCodewords(2, "M"), 28);
  assert.equal(dataCodewords(10, "Q"), 154);
  assert.equal(dataCodewords(40, "L"), 2956);
  assert.equal(dataCodewords(40, "H"), 1276);

  // Posiciones de alineación conocidas (versión 32 es la excepción de la norma).
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);

  // Información de versión (18 bits) presente desde la versión 7.
  assert.equal(versionBits(7), 0x07c94);
  assert.equal(versionBits(40), 0x28c69);
  const code = encodeQr("x".repeat(400), { ecc: "H" });
  assert.ok(code.version >= 7);
  const bits = versionBits(code.version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = code.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    assert.equal(code.modules[b]?.[a], dark, `versión arriba ${i}`);
    assert.equal(code.modules[a]?.[b], dark, `versión abajo ${i}`);
  }
});

test("el texto viaja en UTF-8, byte a byte", () => {
  assert.deepEqual(utf8Bytes("A"), [0x41]);
  assert.deepEqual(utf8Bytes("é"), [0xc3, 0xa9]);
  assert.deepEqual(utf8Bytes("—"), [0xe2, 0x80, 0x94]);
  assert.equal(encodeQr("ñ", { ecc: "L" }).version, 1);
});

test("un texto que no cabe avisa en lugar de mentir", () => {
  assert.throws(() => encodeQr("x".repeat(3000), { ecc: "H" }), /no cabe/);
});

test("las matrices coinciden con la implementación de referencia", () => {
  for (const vector of VECTORS) {
    const text = vector.name.startsWith("forzada") ? TEXTS.media : TEXTS[vector.name];
    assert.ok(text, `texto del vector ${vector.name}`);
    const code = encodeQr(text, {
      ecc: vector.ecc,
      ...(vector.mask === "auto" ? {} : { mask: vector.mask }),
    });
    assert.equal(code.version, vector.version, `versión de ${vector.name} · ${vector.ecc} · ${vector.mask}`);
    if (vector.mask !== "auto") assert.equal(code.mask, vector.mask, `máscara forzada ${vector.mask}`);
    assert.equal(matrixHash(code), vector.hash, `matriz de ${vector.name} · ${vector.ecc} · ${vector.mask}`);
  }
});

test("la máscara elegida es la que menos penaliza de las ocho", () => {
  for (const text of [TEXTS.corta, TEXTS.media, TEXTS.acentos, "x".repeat(400)]) {
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      const auto = encodeQr(text, { ecc });
      const withMask = encodeQr(text, { ecc, mask: auto.mask });
      assert.equal(matrixHash(withMask), matrixHash(auto), `la máscara declarada se aplica de verdad (${ecc})`);
      assert.ok(auto.mask >= 0 && auto.mask <= 7);
    }
  }
});

test("codificar dos veces el mismo texto da la misma matriz", () => {
  const first = encodeQr(TEXTS.larga, { ecc: "M" });
  const second = encodeQr(TEXTS.larga, { ecc: "M" });
  assert.equal(matrixHash(first), matrixHash(second));
  assert.equal(first.mask, second.mask);
});

test("la versión mínima solo puede subir la versión, nunca bajarla", () => {
  const code = encodeQr("https://a.example/", { ecc: "L", minVersion: 10 });
  assert.equal(code.version, 10);
  assert.equal(code.size, 57);
});
