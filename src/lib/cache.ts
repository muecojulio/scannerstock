/**
 * Caché en memoria del proceso + límite de peticiones por cliente.
 *
 * Por qué en `globalThis`: en dev el HMR recarga los módulos y crearía un
 * segundo bucket (dos copias de la caché, dos contadores de rate limit); en
 * producción una instancia serverless caliente reutiliza el mismo bucket entre
 * peticiones, que es exactamente donde la caché ahorra llamadas a la SEC.
 *
 * Límites de esta caché, dichos de frente: es por proceso, no compartida entre
 * instancias, y se pierde en cada cold start. La capa duradera (y compartida)
 * es `market_cache` en Postgres; esta solo evita el viaje a la base y el
 * recálculo en la instancia caliente.
 */

export type CacheEntry<T> = { value: T; at: number };

/** Opciones del límite: cuántas llamadas por ventana deslizante. */
export type RateLimitOptions = { windowMs?: number; limit: number };

type MemoryShape = {
  entries?: Map<string, CacheEntry<unknown>>;
  hits?: Map<string, number[]>;
  /** Padrón de emisores de la SEC (una sola copia por proceso). */
  companies?: unknown[];
  companiesAt?: number;
  /** Tickers con un refresco en vuelo: evita diez descargas simultáneas. */
  refreshing?: Set<string>;
};

const MAX_ENTRIES = 500;
const MAX_RATE_KEYS = 2_000;

const memory = globalThis as typeof globalThis & { __scannerstock?: MemoryShape };

export function bucket(): MemoryShape {
  memory.__scannerstock ??= {};
  return memory.__scannerstock;
}

/** TTL por tipo de dato. La SEC publica filings una vez al día, no por minuto. */
export const TTL_MS = {
  /** Padrón de tickers de la SEC. */
  companies: 12 * 60 * 60 * 1000,
  /** Cifras XBRL ya resumidas (la capa Postgres usa el mismo plazo). */
  snapshot: 12 * 60 * 60 * 1000,
  /** Informe ya calculado: mismo dato, sin repetir diagnóstico ni escritura. */
  result: 10 * 60 * 1000,
  quote: 5 * 60 * 1000,
  fx: 24 * 60 * 60 * 1000,
} as const;

export function memoryGet<T>(key: string, ttlMs: number): T | null {
  const bag = bucket();
  const entry = bag.entries?.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) {
    bag.entries?.delete(key);
    return null;
  }
  // Reordenar: el Map queda aproximadamente por uso reciente.
  bag.entries?.delete(key);
  bag.entries?.set(key, entry);
  return entry.value as T;
}

export function memorySet<T>(key: string, value: T): void {
  const bag = bucket();
  bag.entries ??= new Map();
  bag.entries.delete(key);
  bag.entries.set(key, { value, at: Date.now() });
  // FIFO sobre el más antiguo: acota la memoria sin depender de un LRU externo.
  while (bag.entries.size > MAX_ENTRIES) {
    const oldest = bag.entries.keys().next().value;
    if (oldest === undefined) break;
    bag.entries.delete(oldest);
  }
}

export function memoryDelete(key: string): void {
  bucket().entries?.delete(key);
}

/** Tamaño actual: lo usan las pruebas y el diagnóstico de la caché. */
export function memorySize(): number {
  return bucket().entries?.size ?? 0;
}

/** Vacía todo. Solo pruebas y arranque en frío. */
export function memoryClear(): void {
  memory.__scannerstock = {};
}

/**
 * Límite por clave (IP + acción) en ventana deslizante.
 *
 * Antes el contador era global: un solo visitante insistente agotaba el cupo de
 * todos y cualquiera podía bloquear el servicio a los demás. Ahora cada clave
 * tiene su propia ventana y el mapa está acotado, así que ni llueve sobre todos
 * ni crece sin fin con IPs falsificadas.
 */
export function allow(
  key: string,
  { windowMs = 60_000, limit }: RateLimitOptions,
): { ok: boolean; retryAfterMs: number } {
  const bag = bucket();
  bag.hits ??= new Map();
  const now = Date.now();
  const stamps = (bag.hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (stamps.length >= limit) {
    bag.hits.set(key, stamps);
    return { ok: false, retryAfterMs: windowMs - (now - (stamps[0] ?? now)) };
  }
  stamps.push(now);
  bag.hits.set(key, stamps);
  if (bag.hits.size > MAX_RATE_KEYS) {
    for (const [k, list] of bag.hits) {
      if (list.length === 0) bag.hits.delete(k);
    }
    // Si aun así excede, suelta la mitad más antigua (el Map conserva el orden).
    while (bag.hits.size > MAX_RATE_KEYS) {
      const oldest = bag.hits.keys().next().value;
      if (oldest === undefined) break;
      bag.hits.delete(oldest);
    }
  }
  return { ok: true, retryAfterMs: 0 };
}
