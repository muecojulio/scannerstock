import { createServerFn } from "@tanstack/react-start";
import { TTL_MS, allow, bucket, memoryGet, memorySet } from "./cache";
import { computeMetrics, diagnose, parseOverrides, routeModel } from "./finance/diagnose";
import { fetchFxRates, fetchQuoteWithUsd, toUsd, type QuoteSource } from "./finance/quote";
import { samples } from "./finance/samples";
import { sicLabel } from "./finance/sic";
import { extractSnapshot } from "./finance/xbrl";
import type { MetricOverrides, ModelId, Report, Snapshot } from "./finance/types";

/**
 * Datos públicos de la app. Todo lo que sale de aquí viene de fuentes que no
 * piden llave ni registro:
 *
 *   - SEC EDGAR (data.sec.gov / www.sec.gov): padrón de emisores, submissions y
 *     company facts XBRL. Es la fuente del diagnóstico.
 *   - Yahoo Finance y Stooq: precio de referencia (ver finance/quote.ts).
 *   - frankfurter.app / open.er-api: tipo de cambio para expresar en USD un
 *     precio que cotiza en otra divisa.
 *
 * Tres capas de caché, de más rápida a más durable:
 *   1. memoria del proceso (finance/quote.ts y ./cache.ts) — evita la red y el
 *      recálculo en la instancia caliente;
 *   2. `market_cache` en Postgres — compartida entre instancias y despliegues;
 *   3. los `samples` capturados — último recurso si la SEC limita la red.
 *
 * Una copia vencida no bloquea: se sirve y se refresca en segundo plano
 * (stale-while-revalidate), porque la SEC castiga el abuso y el usuario no
 * debería esperar dos descargas.
 */

function asModel(value: unknown): ModelId | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

/** La SEC exige identificarse; sin User-Agent propio devuelve 403. */
const UA =
  "ScannerStock/1.0 (https://github.com/muecojulio/scannerstock; muecojulio@users.noreply.github.com)";

/** Cuánto vive una copia de cifras XBRL: la SEC publica filings una vez al día. */
const SNAPSHOT_TTL_MS = TTL_MS.snapshot;
/** Copias más viejas que esto se borran: nunca volverían a servirse. */
const RETENTION_DAYS = 30;
/** El barrido corre como mucho una vez por hora por instancia. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** Historial público visible: últimas N lecturas. */
const SCAN_LOG_MAX = 400;
/** Precio de la copia en caché que ya vale la pena volver a preguntar. */
const PRICE_REFRESH_MS = 60 * 60 * 1000;

type Company = { cik: string; ticker: string; title: string };

function padCik(value: number | string): string {
  return String(value).replace(/\D/g, "").padStart(10, "0");
}

async function secJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(28_000),
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new Error("SEC_LIMIT");
    throw new Error(`La SEC respondió ${response.status}. Intenta de nuevo en un momento.`);
  }
  return response.json();
}

/** Padrón público de emisores de la SEC, en memoria mientras siga vigente. */
async function companies(): Promise<Company[]> {
  const bag = bucket();
  const cached = bag.companies;
  if (cached && bag.companiesAt && Date.now() - bag.companiesAt < TTL_MS.companies) {
    return cached as Company[];
  }
  const raw = (await secJson("https://www.sec.gov/files/company_tickers.json")) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;
  const list = Object.values(raw).map((row) => ({
    cik: padCik(row.cik_str),
    ticker: String(row.ticker ?? "").toUpperCase(),
    title: String(row.title ?? ""),
  }));
  bag.companies = list;
  bag.companiesAt = Date.now();
  return list;
}

function cleanTicker(value: string): string {
  const ticker = value.trim().toUpperCase().replace(/\s+/g, "");
  // Sin esta validación el ticker viajaría a una URL externa: deja fuera
  // barras, interrogaciones, saltos de línea y cualquier cosa que no sea un
  // símbolo bursátil.
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker)) {
    throw new Error("Escribe un ticker como AAPL, JPM o NEE.");
  }
  return ticker;
}

/**
 * Clave del cliente para el límite de peticiones.
 *
 * Se toma el ÚLTIMO salto de `x-forwarded-for`: en Vercel la plataforma agrega
 * la IP real al final y un cliente puede inventarse los saltos anteriores. Sin
 * IP conocida (fuera de una petición, pruebas) todas comparten un mismo cupo,
 * que es el comportamiento conservador.
 */
async function clientKey(): Promise<string> {
  try {
    const mod = await import("@tanstack/react-start/server");
    const forwarded = mod.getRequestHeaders().get("x-forwarded-for") ?? "";
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    return hops.at(-1) ?? mod.getRequestIP() ?? "sin-ip";
  } catch {
    return "sin-ip";
  }
}

function asSnapshot(value: unknown): Snapshot {
  const extracted = extractSnapshot({ facts: { "us-gaap": {} } });
  if (!value || typeof value !== "object") return extracted;
  const source = value as Partial<Snapshot>;
  for (const key of Object.keys(extracted) as Array<keyof Snapshot>) {
    const series = source[key];
    if (!Array.isArray(series)) continue;
    extracted[key] = series
      .filter((point) => point && typeof point.end === "string" && typeof point.value === "number")
      .slice(-8);
  }
  return extracted;
}

type CacheRow = {
  companyName: string;
  sic: number | null;
  sicDescription: string;
  snapshot: Snapshot;
  price: number | null;
  currency: string | null;
  fetchedAt: string;
  ageMs: number;
};

/**
 * Lee la copia de Postgres SIN filtrar por edad: el que llama decide si la
 * sirve (fresca), la sirve y refresca (vencida) o la descarta.
 * Una fila con JSON ilegible se trata como ausencia, no como error: se vuelve a
 * descargar y el `on conflict` la reemplaza.
 */
async function readCacheRow(ticker: string): Promise<CacheRow | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    company_name: string;
    sic: number | null;
    sic_description: string;
    snapshot: unknown;
    price: number | string | null;
    price_currency: string | null;
    fetched_at: string;
  }>`select company_name, sic, sic_description, snapshot, price, price_currency, fetched_at
     from market_cache where ticker = ${ticker} limit 1`;
  const row = rows[0];
  if (!row) return null;

  let parsed: Snapshot | null = null;
  try {
    parsed = asSnapshot(typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot);
  } catch {
    return null;
  }

  const fetchedRaw = row.fetched_at as unknown;
  const fetched = fetchedRaw instanceof Date ? fetchedRaw.getTime() : Date.parse(String(fetchedRaw));
  const ageMs = Number.isFinite(fetched) ? Date.now() - fetched : Number.POSITIVE_INFINITY;
  const price = row.price == null ? null : Number(row.price);
  return {
    companyName: row.company_name,
    sic: row.sic,
    sicDescription: row.sic_description,
    snapshot: parsed,
    price: price != null && Number.isFinite(price) ? price : null,
    currency: row.price_currency,
    fetchedAt: row.fetched_at,
    ageMs,
  };
}

async function writeCache(input: {
  ticker: string;
  companyName: string;
  sic: number | null;
  sicDescription: string;
  snapshot: Snapshot;
  price: number | null;
  currency: string | null;
}): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into market_cache
    (ticker, company_name, sic, sic_description, snapshot, price, price_currency, fetched_at)
    values (
      ${input.ticker},
      ${input.companyName},
      ${input.sic},
      ${input.sicDescription},
      ${JSON.stringify(input.snapshot)}::jsonb,
      ${input.price},
      ${input.currency},
      now()
    )
    on conflict (ticker) do update set
      company_name = excluded.company_name,
      sic = excluded.sic,
      sic_description = excluded.sic_description,
      snapshot = excluded.snapshot,
      price = excluded.price,
      price_currency = excluded.price_currency,
      fetched_at = now()`;
}

/**
 * Retención: borra copias que ya nunca se servirían. Sin esto `market_cache`
 * crece para siempre con cada ticker que alguien escanee. Usa
 * `market_cache_fetched_idx`, medido en 4.0–4.7× frente al recorrido completo
 * (npm run db:index-check).
 */
async function sweepStale(): Promise<void> {
  if (memoryGet<number>("sweep:at", SWEEP_INTERVAL_MS)) return;
  memorySet("sweep:at", Date.now());
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`delete from market_cache where fetched_at < now() - (interval '1 day' * ${RETENTION_DAYS})`;
}

/** Descarga de la SEC + escritura en caché. Compartida por el escaneo y el refresco. */
async function fetchFromSec(ticker: string): Promise<{
  companyName: string;
  sic: number | null;
  sicDescription: string;
  snapshot: Snapshot;
} | null> {
  // Si la SEC limita, el error sube tal cual: "no está en el padrón" y "la SEC
  // no respondió" son dos mensajes distintos para el usuario.
  const list = await companies();
  const match = list.find((row) => row.ticker === ticker);
  if (!match) return null;
  const submission = (await secJson(`https://data.sec.gov/submissions/CIK${match.cik}.json`)) as {
    name?: string;
    sic?: string;
    sicDescription?: string;
  };
  const facts = await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${match.cik}.json`);
  const sic = submission.sic ? Number(submission.sic) : null;
  const quote = await fetchQuoteWithUsd(ticker);
  await writeCache({
    ticker,
    companyName: submission.name || match.title,
    sic: Number.isFinite(sic) ? sic : null,
    sicDescription: submission.sicDescription ?? "",
    snapshot: extractSnapshot(facts),
    price: quote.price,
    currency: quote.currency,
  });
  return {
    companyName: submission.name || match.title,
    sic: Number.isFinite(sic) ? sic : null,
    sicDescription: submission.sicDescription ?? "",
    snapshot: extractSnapshot(facts),
  };
}

/**
 * Refresco en segundo plano de una copia vencida. Un candado por ticker evita
 * que diez visitantes simultáneos disparen diez descargas a la SEC.
 *
 * En un serverless la instancia puede morir antes de terminar: no pasa nada, la
 * siguiente petición lo reintenta. Nunca se propaga el error al usuario, que ya
 * recibió su diagnóstico con la copia que había.
 */
async function refreshInBackground(ticker: string): Promise<void> {
  const bag = bucket();
  bag.refreshing ??= new Set();
  if (bag.refreshing.has(ticker)) return;
  bag.refreshing.add(ticker);
  try {
    await fetchFromSec(ticker);
  } catch {
    // La copia vieja sigue sirviendo; el próximo escaneo reintenta.
  } finally {
    bag.refreshing.delete(ticker);
  }
}

async function logScan(ticker: string, model: ModelId, verdict: string): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into scan_log (ticker, model, verdict) values (${ticker}, ${model}, ${verdict})`;
  // Poda en la misma escritura: el historial público nunca pasa de 400 filas.
  await sql`delete from scan_log where id in (
    select id from scan_log order by scanned_at desc offset ${SCAN_LOG_MAX}
  )`;
}

/**
 * Un escaneo que no llegó a término. Se devuelve en vez de lanzar: una excepción
 * dentro de un server fn sale como 500 genérico y el mensaje en español nunca
 * llega a la pantalla.
 */
export type ScanFailure = { found: false; error: string };

export type ScanOutcome = ScanResult | ScanFailure;

export type ScanResult = {
  found: true;
  ticker: string;
  company: string;
  sic: number | null;
  sicDescription: string;
  price: number | null;
  currency: string | null;
  /** Equivalente en USD cuando el precio cotiza en otra divisa; null si no hay tipo de cambio. */
  priceUsd: number | null;
  priceSource: QuoteSource | "cache";
  fetchedAt: string;
  fromCache: boolean;
  sourceNote: string;
  routeReason: string;
  series: { end: string; value: number }[];
  report: Report;
};

function buildReport(input: {
  company: string;
  sic: number | null;
  sicDescription: string;
  sector: string;
  forced: ModelId | null;
  snapshot: Snapshot;
  overrides: MetricOverrides;
}): { report: Report; routeReason: string } {
  const routed = routeModel({
    sectorText: input.sector,
    sic: input.sic,
    sicDescription: input.sicDescription,
    name: input.company,
    forced: input.forced,
  });
  const metrics = computeMetrics(input.snapshot, input.overrides);
  return {
    routeReason: routed.reason,
    report: diagnose({ model: routed.model, metrics, company: input.company }),
  };
}

export const searchCompanies = createServerFn({ method: "POST" })
  .validator((data: { q: string }) => {
    const q = String(data?.q ?? "").trim().slice(0, 40);
    if (q.length < 1) return { q: "" };
    if (!/^[\p{L}\p{N} .&-]{1,40}$/u.test(q)) throw new Error("Búsqueda no válida.");
    return { q };
  })
  .handler(async ({ data }) => {
    if (!data.q) return [];
    const gate = allow(`search:${await clientKey()}`, { limit: 40 });
    if (!gate.ok) throw new Error("Demasiadas búsquedas. Espera un momento.");
    const q = data.q.toUpperCase();
    const list = await companies();
    const exact = list.filter((row) => row.ticker === q);
    const starts = list.filter((row) => row.ticker.startsWith(q) && row.ticker !== q);
    const names = list.filter((row) => row.title.toUpperCase().includes(q) && !row.ticker.startsWith(q));
    return [...exact, ...starts, ...names].slice(0, 8).map((row) => ({
      ticker: row.ticker,
      title: row.title,
    }));
  });

export const scanTicker = createServerFn({ method: "POST" })
  .validator((data: { ticker: string; sector?: string; model?: number | null; overrides?: unknown }) => {
    const ticker = cleanTicker(String(data?.ticker ?? ""));
    const sector = String(data?.sector ?? "").slice(0, 80);
    const model = asModel(data?.model);
    return { ticker, sector, model, overrides: parseOverrides(data?.overrides) };
  })
  .handler(async ({ data }): Promise<ScanOutcome> => {
    const gate = allow(`scan:${await clientKey()}`, { limit: 24 });
    if (!gate.ok) {
      return {
        found: false,
        error: `Demasiados escaneos seguidos. Espera ${Math.max(1, Math.ceil(gate.retryAfterMs / 1000))} segundos.`,
      };
    }
    void sweepStale().catch(() => {});

    // Informe ya calculado con los mismos parámetros: ni red ni base ni recálculo.
    const resultKey = `scan:${data.ticker}|${data.sector}|${data.model ?? 0}|${JSON.stringify(data.overrides)}`;
    const memo = memoryGet<ScanResult>(resultKey, TTL_MS.result);
    if (memo) return memo;

    const row = await readCacheRow(data.ticker);
    let company = row?.companyName ?? "";
    let sic = row?.sic ?? null;
    let sicDescription = row?.sicDescription ?? "";
    let snapshot = row?.snapshot ?? null;
    let price = row?.price ?? null;
    let currency = row?.currency ?? null;
    let priceUsd: number | null = row?.price ?? null;
    let priceSource: QuoteSource | "cache" = row ? "cache" : "none";
    let fromCache = Boolean(row);
    let fetchedAt = row?.fetchedAt ?? new Date().toISOString();
    let sourceNote = row ? "Copia en caché de menos de 12 horas. El origen sigue siendo el filing de la SEC." : "";

    if (!snapshot) {
      const sample = samples[data.ticker];
      let live: Awaited<ReturnType<typeof fetchFromSec>> = null;
      let failure: unknown = null;
      try {
        live = await fetchFromSec(data.ticker);
        if (!live) failure = new Error("NOT_IN_PADRON");
      } catch (error) {
        failure = error;
      }

      if (live) {
        company = live.companyName;
        sic = live.sic;
        sicDescription = live.sicDescription;
        snapshot = live.snapshot;
        fromCache = false;
        fetchedAt = new Date().toISOString();
        sourceNote = "Filing anual leído en vivo desde la SEC.";
      } else if (sample) {
        // Último recurso: cifras capturadas de la SEC cuando la red respondía.
        snapshot = sample.snapshot;
        company = sample.company;
        sic = sample.sic;
        sicDescription = sample.sicDescription;
        fromCache = false;
        fetchedAt = new Date().toISOString();
        sourceNote = sample.note;
      } else {
        const message = failure instanceof Error ? failure.message : "";
        if (message === "NOT_IN_PADRON") {
          return { found: false, error: "Ese ticker no está en el padrón público de la SEC. Puedes cargar las cifras a mano." };
        }
        if (message === "SEC_LIMIT") {
          return { found: false, error: "La SEC limitó temporalmente esta red. Reintenta en unos minutos o diagnostica con tus cifras." };
        }
        // Red caída, DNS, TLS o tiempo agotado: "fetch failed" no le dice nada a
        // nadie y asusta. El diagnóstico manual sigue disponible.
        return { found: false, error: "No se pudo leer la SEC en este momento. Reintenta en unos minutos o diagnostica con tus cifras." };
      }
    } else if (row && row.ageMs > SNAPSHOT_TTL_MS) {
      // Copia vencida: se sirve ya y se renueva sin hacer esperar a nadie.
      void refreshInBackground(data.ticker);
      sourceNote = `Copia de hace ${Math.round(row.ageMs / 3_600_000)} h servida mientras se renueva el filing.`;
    }

    // Precio de referencia: caduca rápido, así que se vuelve a preguntar cuando
    // la copia no lo trae o ya tiene más de una hora. Con divisa distinta de USD
    // se muestra también su equivalente, con el tipo de cambio público del día.
    const priceIsOld = !row || price == null || row.ageMs > PRICE_REFRESH_MS;
    if (priceIsOld) {
      const live = await fetchQuoteWithUsd(data.ticker);
      price = live.price;
      currency = live.currency;
      priceUsd = live.priceUsd;
      priceSource = live.source;
    } else if (currency && currency.toUpperCase() !== "USD") {
      priceSource = "cache";
      priceUsd = toUsd(price, currency, await fetchFxRates());
    } else {
      priceSource = "cache";
      priceUsd = price;
    }

    // Si la SEC no trae descripción, la pone la tabla oficial del SIC Manual.
    const description = sicDescription || sicLabel(sic);
    const built = buildReport({
      company,
      sic,
      sicDescription: description,
      sector: data.sector,
      forced: data.model,
      snapshot,
      overrides: data.overrides,
    });
    await logScan(data.ticker, built.report.model, built.report.verdict);

    const result: ScanResult = {
      found: true,
      ticker: data.ticker,
      company,
      sic,
      sicDescription: description,
      price,
      currency,
      priceUsd,
      priceSource,
      fetchedAt,
      fromCache,
      sourceNote,
      routeReason: built.routeReason,
      series: snapshot.revenue.slice(-6),
      report: built.report,
    };
    memorySet(resultKey, result);
    return result;
  });

export const listScans = createServerFn({ method: "GET" }).handler(async () => {
  const gate = allow(`history:${await clientKey()}`, { limit: 60 });
  if (!gate.ok) throw new Error("Demasiadas consultas al historial. Espera un momento.");
  const cached = memoryGet<Array<{ ticker: string; model: number; verdict: string; scanned_at: string }>>(
    "scan_log:recent",
    15_000,
  );
  if (cached) return cached;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ ticker: string; model: number; verdict: string; scanned_at: string }>`
    select ticker, model, verdict, scanned_at
    from scan_log
    order by scanned_at desc
    limit 20
  `;
  memorySet("scan_log:recent", rows);
  return rows;
});
