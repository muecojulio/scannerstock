import { TTL_MS, bucket, memoryGet, memorySet } from "../cache.ts";

/**
 * Precio de referencia con fuentes públicas que no piden llave ni registro.
 *
 * Cadena de intentos (gana la primera que responda):
 *   1. Yahoo Finance `v8/finance/chart` — JSON con precio regular y divisa.
 *   2. Stooq `q/l` — CSV abierto, con el sufijo de mercado que le corresponde.
 *
 * El precio NO entra en el veredicto: es contexto. Si ninguna fuente responde,
 * el diagnóstico sigue igual y la UI dice "Precio no disponible".
 *
 * Las funciones `parse*` son puras (sin fetch) para probarlas con respuestas
 * reales guardadas; `fetchQuote` es la única que toca la red, y nunca lanza.
 */

export type QuoteSource = "yahoo" | "stooq" | "none";

export type Quote = {
  price: number | null;
  currency: string | null;
  source: QuoteSource;
  /** ISO de cuándo se obtuvo. */
  at: string;
};

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function finiteOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Yahoo `chart` → { price, currency }. Tolera el sobre completo de la API. */
export function parseYahooChart(body: unknown): { price: number | null; currency: string | null } {
  const result = (body as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart
    ?.result?.[0]?.meta;
  if (!result || typeof result !== "object") return { price: null, currency: null };
  return {
    price: finiteOrNull(result.regularMarketPrice),
    currency: typeof result.currency === "string" ? result.currency.toUpperCase() : null,
  };
}

/**
 * Stooq CSV → { price, currency }.
 *
 * Formato con `f=sd2t2ohlcv&h&e=csv` (el encabezado puede venir o no, y los
 * valores ausentes llegan como `N/D`):
 *
 *   Symbol,Date,Time,Open,High,Low,Close,Volume
 *   AAPL.US,2026-10-09,16:00:00,182.34,183.06,181.06,183.05,50759583
 *
 * Stooq no publica la divisa: solo se afirma USD cuando el símbolo pedido
 * llevaba el sufijo `.us`; si no, la divisa queda desconocida (null) y la UI no
 * convierte nada.
 */
export function parseStooqCsv(
  csv: string,
  requestedSymbol: string,
): { price: number | null; currency: string | null } {
  const rows = String(csv)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // Se salta el encabezado por nombre, no por "tener dígitos": una fila real con
  // todos los valores en N/D no tiene ninguno.
  const dataRow = rows.find((line) => !/^symbol,/i.test(line));
  if (!dataRow) return { price: null, currency: null };
  const cells = dataRow.split(",");
  // sd2t2ohlcv → Symbol,Date,Time,Open,High,Low,Close,Volume: el cierre es el
  // 7º campo cuando vienen los 8, y el último si Stooq recorta la fila.
  const close = cells.length >= 8 ? cells[6] : cells[cells.length - 1];
  return {
    price: finiteOrNull(String(close ?? "").trim()),
    currency: requestedSymbol.toLowerCase().endsWith(".us") ? "USD" : null,
  };
}

/** frankfurter.app / open.er-api `latest` → tabla de cambios contra la base. */
export function parseFxRates(body: unknown): Record<string, number> | null {
  const rates = (body as { rates?: unknown })?.rates;
  if (!rates || typeof rates !== "object") return null;
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(rates)) {
    const rate = finiteOrNull(value);
    if (rate) out[code.toUpperCase()] = rate;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Convierte a USD con la tabla de cambios. USD y divisa desconocida no tocan. */
export function toUsd(
  price: number | null,
  currency: string | null,
  rates: Record<string, number> | null,
): number | null {
  if (price == null) return null;
  const code = currency?.toUpperCase() ?? "";
  if (!code || code === "USD") return price;
  const rate = rates?.[code];
  return rate ? price / rate : null;
}

async function getJson(url: string, timeoutMs: number, ua: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": ua, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,text/plain,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function yahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const body = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      8_000,
      BROWSER_UA,
    );
    const { price, currency } = parseYahooChart(body);
    if (price == null) return null;
    return { price, currency, source: "yahoo", at: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function stooqQuote(ticker: string): Promise<Quote | null> {
  const base = ticker.toLowerCase().replace(/\./g, "-");
  for (const symbol of [`${base}.us`, base]) {
    try {
      const csv = await getText(
        `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`,
        8_000,
      );
      const { price, currency } = parseStooqCsv(csv, symbol);
      if (price != null) return { price, currency, source: "stooq", at: new Date().toISOString() };
    } catch {
      // siguiente intento
    }
  }
  return null;
}

/**
 * Precio con caché en memoria (5 min) y dos fuentes públicas. Nunca lanza:
 * devuelve `source: "none"` cuando ninguna responde.
 */
export async function fetchQuote(ticker: string): Promise<Quote> {
  const key = `quote:${ticker.toUpperCase()}`;
  const cached = memoryGet<Quote>(key, TTL_MS.quote);
  if (cached) return cached;

  const quote =
    (await yahooQuote(ticker.replace(/\./g, "-"))) ??
    (await stooqQuote(ticker)) ??
    ({ price: null, currency: null, source: "none", at: new Date().toISOString() } satisfies Quote);

  memorySet(key, quote);
  // Un fallo no debe pincharse 5 minutos: se revalida al minuto siguiente.
  if (quote.source === "none") {
    memorySet(key, { ...quote, at: Date.now() - TTL_MS.quote + 60_000 });
  }
  return quote;
}

/** Cambios contra USD. Caché de 24 h: el BCE publica una referencia al día. */
export async function fetchFxRates(): Promise<Record<string, number> | null> {
  const cached = memoryGet<Record<string, number>>("fx:USD", TTL_MS.fx);
  if (cached) return cached;
  for (const url of [
    "https://api.frankfurter.app/latest?from=USD",
    "https://open.er-api.com/v6/latest/USD",
  ]) {
    try {
      const rates = parseFxRates(await getJson(url, 6_000, "ScannerStock/1.0"));
      if (rates) {
        memorySet("fx:USD", rates);
        return rates;
      }
    } catch {
      // siguiente fuente
    }
  }
  // Sin red: sirve la última tabla conocida aunque haya caducado, antes que
  // dejar el precio sin convertir.
  return bucket().entries?.get("fx:USD")?.value as Record<string, number> | undefined ?? null;
}

/** Precio + su equivalente en USD cuando la divisa no es USD. */
export async function fetchQuoteWithUsd(ticker: string): Promise<{
  price: number | null;
  currency: string | null;
  priceUsd: number | null;
  source: QuoteSource;
}> {
  const quote = await fetchQuote(ticker);
  if (quote.price == null) {
    return { price: null, currency: null, priceUsd: null, source: quote.source };
  }
  const code = quote.currency?.toUpperCase() ?? "";
  const rates = code && code !== "USD" ? await fetchFxRates() : null;
  return {
    price: quote.price,
    currency: quote.currency,
    priceUsd: toUsd(quote.price, quote.currency, rates),
    source: quote.source,
  };
}
