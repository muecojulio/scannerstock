/**
 * Codificador QR propio (ISO/IEC 18004), modo byte, versiones 1–40 y los
 * cuatro niveles de corrección de errores.
 *
 * Está escrito a mano por la misma razón que el resto del proyecto no usa
 * dependencias: el QR que se publica aquí lleva una sola cosa —el enlace
 * público de la app— y eso no justifica arrastrar un paquete con su propio
 * árbol de dependencias, su superficie de ataque y su versión que hay que
 * vigilar. Son ~300 líneas de aritmética finita, todas probadas contra una
 * implementación de referencia (`encode.test.ts`).
 *
 * Decisiones que conviene no deshacer:
 *
 *   - Modo byte con UTF-8: vale para cualquier enlace o texto. Los caracteres
 *     contables de 4 bits son 8 hasta la versión 9 y 16 desde la 10; usar el
 *     ancho equivocado desplaza todos los codewords y el QR deja de leerse.
 *   - La versión es la MENOR que cabe, para que el código salga con los
 *     módulos más grandes posible (más fácil de enfocar con la cámara).
 *   - La máscara no se elige al azar ni se fija: se prueban las ocho y gana la
 *     que menos penaliza según las cuatro reglas de la norma. Dos QR con los
 *     mismos datos y distinta máscara se leen igual, pero uno se ensucia antes
 *     al imprimirlo.
 *   - Los bits de sobra (los "remainder bits") se quedan claros, que es lo que
 *     pide la norma; no se rellenan con ruido.
 */

/** Nivel de corrección de errores: recupera ~7 %, 15 %, 25 % y 30 %. */
export type EccLevel = "L" | "M" | "Q" | "H";

export type QrCode = {
  /** Texto exacto que se codificó. */
  text: string;
  ecc: EccLevel;
  /** Versión 1–40 (la 1 son 21×21 módulos). */
  version: number;
  /** Módulos por lado, sin la zona de silencio: 4·versión + 17. */
  size: number;
  /** Máscara elegida (0–7). */
  mask: number;
  /** `modules[y][x] === true` es un módulo oscuro. */
  modules: boolean[][];
};

export type QrOptions = {
  ecc?: EccLevel;
  /** Máscara forzada. Solo para pruebas: lo normal es que la elija el codificador. */
  mask?: number;
  /** Versión mínima. Útil para comparar contra una referencia. */
  minVersion?: number;
};

const VERSION_MIN = 1;
const VERSION_MAX = 40;

/** Identificador de cada nivel en la información de formato (ISO 18004, tabla 25). */
const ECC_FORMAT_BITS: Record<EccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Los bytes de relleno cuando los datos no llenan la versión. */
const PAD_CODEWORDS = [0xec, 0x11] as const;

/** Corrección por bloque, en codewords (ISO 18004, tabla 13–22). */
const ECC_CODEWORDS_PER_BLOCK: Record<EccLevel, readonly number[]> = {
  L: numbers(
    "7 10 15 20 26 18 20 24 30 18 20 24 26 30 22 24 28 30 28 28 28 28 30 30 26 28 30 30 30 30 30 30 30 30 30 30 30 30 30 30",
  ),
  M: numbers(
    "10 16 26 18 24 16 18 22 22 26 30 22 22 24 24 28 28 26 26 26 26 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28",
  ),
  Q: numbers(
    "13 22 18 26 18 24 18 22 20 24 28 26 24 20 30 24 28 28 26 30 28 30 30 30 30 28 30 30 30 30 30 30 30 30 30 30 30 30 30 30",
  ),
  H: numbers(
    "17 28 22 16 22 28 26 26 24 28 24 28 22 24 24 30 28 28 26 28 30 24 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30",
  ),
};

/** Cuántos bloques se reparten los datos, por versión (ISO 18004, misma tabla). */
const BLOCK_COUNT: Record<EccLevel, readonly number[]> = {
  L: numbers(
    "1 1 1 1 1 2 2 2 2 4 4 4 4 4 6 6 6 6 7 8 8 9 9 10 12 12 12 13 14 15 16 17 18 19 19 20 21 22 24 25",
  ),
  M: numbers(
    "1 1 1 2 2 4 4 4 5 5 5 8 9 9 10 10 11 13 14 16 17 17 18 20 21 23 25 26 28 29 31 33 35 37 38 40 43 45 47 49",
  ),
  Q: numbers(
    "1 1 2 2 4 4 6 6 8 8 8 10 12 16 12 17 16 18 21 20 23 23 25 27 29 34 34 35 38 40 43 45 48 51 53 56 59 62 65 68",
  ),
  H: numbers(
    "1 1 2 4 4 4 5 6 8 8 11 11 16 16 18 16 19 21 25 25 25 34 30 32 35 37 40 42 45 48 51 54 57 60 63 66 70 74 77 81",
  ),
};

/** Convierte la tabla escrita como texto en una lista de números. */
function numbers(text: string): number[] {
  return text.trim().split(/\s+/).map(Number);
}

/* --------------------------------------------------------------- GF(256) */

/*
 * Aritmética de Galois con el polinomio primitivo x⁸ + x⁴ + x³ + x² + 1
 * (0x11d), que es el que fija la norma. Las tablas se calculan una vez al
 * cargar el módulo: multiplicar y dividir por α pasa a ser una suma.
 */
const GF_SIZE = 256;
const GF_EXP = new Uint8Array(GF_SIZE * 2);
const GF_LOG = new Uint8Array(GF_SIZE);

{
  let value = 1;
  for (let i = 0; i < GF_SIZE - 1; i++) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = GF_SIZE - 1; i < GF_EXP.length; i++) GF_EXP[i] = GF_EXP[i - (GF_SIZE - 1)];
}

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * Polinomio generador de Reed–Solomon de grado `degree`, con los coeficientes
 * de menor a mayor exponente. Es el producto de (x − αⁱ) para i = 0…degree−1.
 */
function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const root = GF_EXP[i];
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMultiply(poly[j], root);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

/**
 * Resto de dividir los datos (con `degree` ceros detrás) entre el generador:
 * eso es, exactamente, la corrección de errores que viaja con el bloque.
 */
function reedSolomonRemainder(data: number[], degree: number): number[] {
  const divisor = generatorPolynomial(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let i = 0; i < degree; i++) {
      // Coeficientes del divisor sin el término líder (que es 1).
      remainder[i] ^= gfMultiply(divisor[degree - 1 - i], factor);
    }
  }
  return remainder;
}

/* --------------------------------------------------------- capacidades */

/** Módulos disponibles para datos y corrección, sin los patrones de función. */
function rawDataModules(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}

function eccPerBlock(version: number, ecc: EccLevel): number {
  const value = ECC_CODEWORDS_PER_BLOCK[ecc][version - 1];
  if (value === undefined) throw new Error(`Versión QR fuera de rango: ${version}.`);
  return value;
}

function blockCount(version: number, ecc: EccLevel): number {
  const value = BLOCK_COUNT[ecc][version - 1];
  if (value === undefined) throw new Error(`Versión QR fuera de rango: ${version}.`);
  return value;
}

/** Codewords que llevan datos (sin la corrección) en esa versión y nivel. */
export function dataCodewords(version: number, ecc: EccLevel): number {
  return Math.floor(rawDataModules(version) / 8) - eccPerBlock(version, ecc) * blockCount(version, ecc);
}

/** Bits del contador de caracteres en modo byte: 8 hasta la versión 9, 16 desde la 10. */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Bytes que ocupa el texto en UTF-8. */
export function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/* ------------------------------------------------------------- bitstream */

class BitStream {
  private readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  /** Cierra el flujo en bytes: el último byte se completa con ceros. */
  toBytes(): number[] {
    const bytes = new Array<number>(Math.ceil(this.bits.length / 8)).fill(0);
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) bytes[i >>> 3] |= 0x80 >>> (i & 7);
    }
    return bytes;
  }
}

/** Elige la versión más pequeña que cabe y devuelve la lista de codewords. */
function buildCodewords(bytes: number[], version: number, ecc: EccLevel): number[] {
  const capacityBits = dataCodewords(version, ecc) * 8;
  const stream = new BitStream();
  stream.push(0b0100, 4); // modo byte
  stream.push(bytes.length, charCountBits(version));
  for (const byte of bytes) stream.push(byte, 8);

  // Terminador: hasta cuatro ceros, nunca más de los que caben.
  const terminator = Math.min(4, capacityBits - stream.length);
  stream.push(0, terminator);
  // Hasta el siguiente byte.
  stream.push(0, (8 - (stream.length % 8)) % 8);

  const codewords = stream.toBytes();
  // Relleno alterno 0xEC / 0x11 hasta llenar la versión.
  for (let i = 0; codewords.length < capacityBits / 8; i++) {
    codewords.push(PAD_CODEWORDS[i % 2] as number);
  }
  return codewords;
}

/**
 * Reparte los codewords en bloques, calcula la corrección de cada uno y los
 * entrelaza como manda la norma: primero los datos de todos los bloques, byte
 * a byte, y después la corrección, también en orden.
 */
function interleave(codewords: number[], version: number, ecc: EccLevel): number[] {
  const blocks = blockCount(version, ecc);
  const ecLength = eccPerBlock(version, ecc);
  const totalCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlockLength = Math.floor(totalCodewords / blocks) - ecLength;
  const longBlocks = totalCodewords % blocks;

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blocks; i++) {
    const length = shortBlockLength + (i >= blocks - longBlocks ? 1 : 0);
    const block = codewords.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomonRemainder(block, ecLength));
  }

  const result: number[] = [];
  const longest = shortBlockLength + (longBlocks > 0 ? 1 : 0);
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i] as number);
    }
  }
  for (let i = 0; i < ecLength; i++) {
    for (const block of ecBlocks) result.push(block[i] as number);
  }
  return result;
}

/* -------------------------------------------------------------- formato */

/** 15 bits de información de formato: BCH(15,5) con el generador 0x537 y la máscara 0x5412. */
export function formatBits(ecc: EccLevel, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

/** 18 bits de información de versión: BCH(18,6) con el generador 0x1f25. */
export function versionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

/* --------------------------------------------------------------- matriz */

type Matrix = {
  size: number;
  /** `true` = módulo oscuro. */
  modules: boolean[][];
  /** `true` = módulo reservado por un patrón de función (no lleva datos). */
  reserved: boolean[][];
};

function emptyMatrix(size: number): Matrix {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunction(matrix: Matrix, x: number, y: number, dark: boolean): void {
  matrix.modules[y]![x] = dark;
  matrix.reserved[y]![x] = true;
}

/** Posiciones de los patrones de alineación de cada versión. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let position = size - 7; positions.length < count; position -= step) {
    positions.splice(1, 0, position);
  }
  return positions;
}

function drawFinder(matrix: Matrix, centerX: number, centerY: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= matrix.size || y >= matrix.size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      // Anillo oscuro en el borde, hueco claro y núcleo oscuro.
      setFunction(matrix, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(matrix: Matrix, centerX: number, centerY: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(matrix, centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFormatBits(matrix: Matrix, ecc: EccLevel, mask: number): void {
  const bits = formatBits(ecc, mask);
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;
  const size = matrix.size;

  // Copia alrededor del patrón superior izquierdo.
  for (let i = 0; i <= 5; i++) setFunction(matrix, 8, i, bit(i));
  setFunction(matrix, 8, 7, bit(6));
  setFunction(matrix, 8, 8, bit(7));
  setFunction(matrix, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(matrix, 14 - i, 8, bit(i));

  // Copia repartida entre los otros dos patrones.
  for (let i = 0; i < 8; i++) setFunction(matrix, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(matrix, 8, size - 15 + i, bit(i));

  // Módulo oscuro fijo, siempre encendido.
  setFunction(matrix, 8, size - 8, true);
}

function drawFunctionPatterns(matrix: Matrix, version: number, ecc: EccLevel): void {
  // Tiempo: fila y columna 6, alternando.
  for (let i = 0; i < matrix.size; i++) {
    setFunction(matrix, 6, i, i % 2 === 0);
    setFunction(matrix, i, 6, i % 2 === 0);
  }

  drawFinder(matrix, 3, 3);
  drawFinder(matrix, matrix.size - 4, 3);
  drawFinder(matrix, 3, matrix.size - 4);

  const positions = alignmentPositions(version);
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      // Los tres rincones ya están ocupados por los patrones de localización.
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0);
      if (corner) continue;
      drawAlignment(matrix, positions[i] as number, positions[j] as number);
    }
  }

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = matrix.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(matrix, a, b, dark);
      setFunction(matrix, b, a, dark);
    }
  }

  // La información de formato se reserva aquí (con la máscara 0) y se
  // reescribe al final con la máscara elegida.
  drawFormatBits(matrix, ecc, 0);
}

/** Coloca los codewords en zigzag desde la esquina inferior derecha. */
function drawCodewords(matrix: Matrix, codewords: number[]): void {
  let index = 0;
  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // la columna 6 es de tiempo
    for (let vertical = 0; vertical < matrix.size; vertical++) {
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? matrix.size - 1 - vertical : vertical;
        if (matrix.reserved[y]![x] || index >= codewords.length * 8) continue;
        const dark = ((codewords[index >>> 3] as number) >>> (7 - (index & 7))) & 1;
        matrix.modules[y]![x] = dark !== 0;
        index++;
      }
    }
  }
}

/** Las ocho máscaras de la norma (x = columna, y = fila). */
const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(matrix: Matrix, mask: number): void {
  const invert = MASKS[mask];
  if (!invert) throw new Error(`Máscara QR fuera de rango: ${mask}.`);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.reserved[y]![x] && invert(x, y)) matrix.modules[y]![x] = !matrix.modules[y]![x];
    }
  }
}

/* ------------------------------------------------------------- penalización */

/** N1: cinco módulos seguidos del mismo color ya penalizan. */
const PENALTY_RUN = 3;
/** N2: cada bloque 2×2 del mismo color. */
const PENALTY_BLOCK = 3;
/** N3: cada dibujo con la proporción 1:1:3:1:1, que confunde al lector. */
const PENALTY_FINDER = 40;
/** N4: cada 5 % que el reparto de oscuros se aleja del 50 %. */
const PENALTY_BALANCE = 10;

const FINDER_PATTERNS = [0b10111010000, 0b00001011101] as const;

/**
 * Cuánto se ensucia el símbolo con esa máscara, según las cuatro reglas de la
 * norma. Cuanto menos, mejor: esa es la máscara que se queda.
 */
export function penaltyScore(modules: readonly boolean[][]): number {
  const size = modules.length;
  let score = 0;

  // Reglas 1 y 3, por filas y por columnas.
  for (let y = 0; y < size; y++) {
    const row = modules[y] as boolean[];
    score += runPenalty(row) + finderPenalty(row);
  }
  for (let x = 0; x < size; x++) {
    const column: boolean[] = [];
    for (let y = 0; y < size; y++) column.push((modules[y] as boolean[])[x] as boolean);
    score += runPenalty(column) + finderPenalty(column);
  }

  // Regla 2: bloques 2×2 del mismo color.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const first = (modules[y] as boolean[])[x];
      if (
        first === (modules[y] as boolean[])[x + 1] &&
        first === (modules[y + 1] as boolean[])[x] &&
        first === (modules[y + 1] as boolean[])[x + 1]
      ) {
        score += PENALTY_BLOCK;
      }
    }
  }

  // Regla 4: proporción de oscuros, lo más cerca posible del 50 %.
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if ((modules[y] as boolean[])[x]) dark++;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * PENALTY_BALANCE;

  return score;
}

function runPenalty(line: readonly boolean[]): number {
  let score = 0;
  let runColor = line[0];
  let runLength = 1;
  for (let i = 1; i < line.length; i++) {
    if (line[i] === runColor) {
      runLength++;
      if (runLength === 5) score += PENALTY_RUN;
      else if (runLength > 5) score += 1;
    } else {
      runColor = line[i];
      runLength = 1;
    }
  }
  return score;
}

function finderPenalty(line: readonly boolean[]): number {
  let score = 0;
  let window = 0;
  for (let i = 0; i < line.length; i++) {
    window = ((window << 1) | (line[i] ? 1 : 0)) & 0x7ff;
    if (i < 10) continue;
    if (window === FINDER_PATTERNS[0] || window === FINDER_PATTERNS[1]) score += PENALTY_FINDER;
  }
  return score;
}

/* ----------------------------------------------------------------- API */

/**
 * Codifica `text` en un QR de la versión más pequeña que lo admita.
 * Lanza si el texto no cabe ni en la versión 40 (2 953 bytes en modo byte).
 */
export function encodeQr(text: string, options: QrOptions = {}): QrCode {
  const ecc = options.ecc ?? "M";
  const bytes = utf8Bytes(text);
  const minVersion = Math.min(Math.max(options.minVersion ?? VERSION_MIN, VERSION_MIN), VERSION_MAX);

  let version = 0;
  for (let candidate = minVersion; candidate <= VERSION_MAX; candidate++) {
    const capacity = dataCodewords(candidate, ecc) * 8;
    const needed = 4 + charCountBits(candidate) + bytes.length * 8;
    if (needed <= capacity) {
      version = candidate;
      break;
    }
  }
  if (version === 0) {
    throw new Error(`El texto no cabe en un QR de 40 versiones con corrección ${ecc}.`);
  }

  const codewords = interleave(buildCodewords(bytes, version, ecc), version, ecc);
  const size = version * 4 + 17;

  // Matriz base: patrones de función + datos, sin máscara todavía.
  const base = emptyMatrix(size);
  drawFunctionPatterns(base, version, ecc);
  drawCodewords(base, codewords);

  const candidates = options.mask === undefined ? Array.from({ length: 8 }, (_, i) => i) : [options.mask];
  let best: Matrix | null = null;
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const mask of candidates) {
    const candidate = emptyMatrix(size);
    candidate.modules = base.modules.map((row) => [...row]);
    candidate.reserved = base.reserved.map((row) => [...row]);
    applyMask(candidate, mask);
    drawFormatBits(candidate, ecc, mask);
    const score = penaltyScore(candidate.modules);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = mask;
    }
  }

  if (!best) throw new Error("No se pudo aplicar ninguna máscara al QR.");
  return { text, ecc, version, size, mask: bestMask, modules: best.modules };
}
