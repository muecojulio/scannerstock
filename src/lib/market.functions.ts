import { createServerFn } from "@tanstack/react-start";
import { computeMetrics, diagnose, parseOverrides, routeModel } from "./finance/diagnose";
import { extractSnapshot } from "./finance/xbrl";
import { samples } from "./finance/samples";
import type { MetricOverrides, ModelId, Report, Snapshot } from "./finance/types";

function asModel(value: unknown): ModelId | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

const UA =
  "ScannerStock/1.0 (https://github.com/muecojulio/scannerstock; muecojulio@users.noreply.github.com)";
const CACHE_MS = 12 * 60 * 60 * 1000;

type Company = { cik: string; ticker: string; title: string };

type Memory = {
  companies?: Company[];
  companiesAt?: number;
  hits?: number[];
};

const memory = globalThis as typeof globalThis & { __scannerstock?: Memory };

function bucket(): Memory {
  memory.__scannerstock ??= {};
  return memory.__scannerstock;
}

function allow(limit: number): boolean {
  const now = Date.now();
  const bag = bucket();
  bag.hits = (bag.hits ?? []).filter((stamp) => now - stamp < 60_000);
  if (bag.hits.length >= limit) return false;
  bag.hits.push(now);
  return true;
}

async function secJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(28_000),
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error("SEC_LIMIT");
    }
    throw new Error(`La SEC respondió ${response.status}. Intenta de nuevo en un momento.`);
  }
  return response.json();
}

function padCik(value: number | string): string {
  return String(value).replace(/\D/g, "").padStart(10, "0");
}

async function companies(): Promise<Company[]> {
  const bag = bucket();
  if (bag.companies && bag.companiesAt && Date.now() - bag.companiesAt < CACHE_MS) return bag.companies;
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
  if (!/^[A-Z0-9][A-Z0-9.\\-]{0,14}$/.test(ticker)) {
    throw new Error("Escribe un ticker como AAPL, JPM o NEE.");
  }
  return ticker;
}

async function quote(ticker: string): Promise<{ price: number | null; currency: string | null }> {
  const symbol = ticker.replace(/\./g, "-");
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return { price: null, currency: null };
    const body = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string } }> };
    };
    const meta = body.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    return {
      price: typeof price === "number" && Number.isFinite(price) ? price : null,
      currency: meta?.currency ?? null,
    };
  } catch {
    return { price: null, currency: null };
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

async function readCache(ticker: string): Promise<{
  companyName: string;
  sic: number | null;
  sicDescription: string;
  snapshot: Snapshot;
  price: number | null;
  currency: string | null;
  fetchedAt: string;
} | null> {
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
  const fetchedRaw = row.fetched_at as unknown;
  const fetched = fetchedRaw instanceof Date ? fetchedRaw.getTime() : Date.parse(String(fetchedRaw));
  if (!Number.isFinite(fetched) || Date.now() - fetched > CACHE_MS) return null;
  const price = row.price == null ? null : Number(row.price);
  return {
    companyName: row.company_name,
    sic: row.sic,
    sicDescription: row.sic_description,
    snapshot: asSnapshot(typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot),
    price: price != null && Number.isFinite(price) ? price : null,
    currency: row.price_currency,
    fetchedAt: row.fetched_at,
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
}) {
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

async function logScan(ticker: string, model: ModelId, verdict: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into scan_log (ticker, model, verdict) values (${ticker}, ${model}, ${verdict})`;
  await sql`delete from scan_log where id in (
    select id from scan_log order by scanned_at desc offset 400
  )`;
}

export type ScanResult = {
  found: true;
  ticker: string;
  company: string;
  sic: number | null;
  sicDescription: string;
  price: number | null;
  currency: string | null;
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
    if (!allow(40)) throw new Error("Demasiadas búsquedas. Espera un momento.");
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
  .handler(async ({ data }): Promise<ScanResult> => {
    if (!allow(24)) throw new Error("Demasiados escaneos seguidos. Espera un minuto.");
    const cached = await readCache(data.ticker);
    let company = cached?.companyName ?? "";
    let sic = cached?.sic ?? null;
    let sicDescription = cached?.sicDescription ?? "";
    let snapshot = cached?.snapshot;
    let price = cached?.price ?? null;
    let currency = cached?.currency ?? null;
    let fromCache = Boolean(cached);
    let sourceNote = cached
      ? "Copia en caché de menos de 12 horas. El origen sigue siendo el filing de la SEC."
      : "";
    let fetchedAt = cached?.fetchedAt ?? new Date().toISOString();

    if (!snapshot) {
      const list = await companies().catch((error: unknown) => {
        if (error instanceof Error && error.message === "SEC_LIMIT") return null;
        throw error;
      });
      const match = list?.find((row) => row.ticker === data.ticker);
      const sample = samples[data.ticker];
      if (!match && !sample) {
        throw new Error("Ese ticker no está en el padrón público de la SEC. Puedes cargar las cifras a mano.");
      }
      try {
        if (!match) throw new Error("SEC_LIMIT");
        const submission = (await secJson(`https://data.sec.gov/submissions/CIK${match.cik}.json`)) as {
          name?: string;
          sic?: string;
          sicDescription?: string;
        };
        const facts = await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${match.cik}.json`);
        snapshot = extractSnapshot(facts);
        company = submission.name || match.title;
        sic = submission.sic ? Number(submission.sic) : null;
        sicDescription = submission.sicDescription ?? "";
        const live = await quote(data.ticker);
        price = live.price;
        currency = live.currency;
        fetchedAt = new Date().toISOString();
        fromCache = false;
        sourceNote = "Filing anual leído en vivo desde la SEC.";
        await writeCache({
          ticker: data.ticker,
          companyName: company,
          sic: Number.isFinite(sic) ? sic : null,
          sicDescription,
          snapshot,
          price,
          currency,
        });
      } catch (error) {
        const limited = error instanceof Error && error.message === "SEC_LIMIT";
        if (!limited || !sample) throw error instanceof Error && error.message === "SEC_LIMIT"
          ? new Error("La SEC limitó temporalmente esta red. Reintenta en unos minutos o diagnostica con tus cifras.")
          : error;
        snapshot = sample.snapshot;
        company = sample.company;
        sic = sample.sic;
        sicDescription = sample.sicDescription;
        const live = await quote(data.ticker);
        price = live.price;
        currency = live.currency;
        fromCache = false;
        sourceNote = sample.note;
        fetchedAt = new Date().toISOString();
      }
    }

    const built = buildReport({
      company,
      sic,
      sicDescription,
      sector: data.sector,
      forced: data.model,
      snapshot,
      overrides: data.overrides,
    });
    await logScan(data.ticker, built.report.model, built.report.verdict);
    return {
      found: true,
      ticker: data.ticker,
      company,
      sic,
      sicDescription,
      price,
      currency,
      fetchedAt,
      fromCache,
      sourceNote,
      routeReason: built.routeReason,
      series: snapshot.revenue.slice(-6),
      report: built.report,
    };
  });

export const listScans = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  return sql<{
    ticker: string;
    model: number;
    verdict: string;
    scanned_at: string;
  }>`
    select ticker, model, verdict, scanned_at
    from scan_log
    order by scanned_at desc
    limit 20
  `;
});
