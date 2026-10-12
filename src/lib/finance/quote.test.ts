import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  fetchQuote,
  fetchQuoteWithUsd,
  parseFxRates,
  parseStooqCsv,
  parseYahooChart,
  toUsd,
} from "./quote.ts";
import { memoryClear, memoryGet, TTL_MS } from "../cache.ts";

const realFetch = globalThis.fetch;

/** Stub de fetch por prefijo de URL. Registra cuántas veces se llamó cada una. */
function stubFetch(
  routes: Record<string, { status?: number; body?: unknown; text?: string }>,
) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const route = key ? routes[key] : { status: 404 };
    const status = route.status ?? 200;
    return new Response(route.text ?? JSON.stringify(route.body ?? {}), {
      status,
      headers: { "content-type": route.text ? "text/csv" : "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

beforeEach(() => memoryClear());
afterEach(() => {
  globalThis.fetch = realFetch;
  memoryClear();
});

test("parseYahooChart lee el precio regular y la divisa", () => {
  const body = {
    chart: { result: [{ meta: { regularMarketPrice: 259.45, currency: "usd" } }] },
  };
  assert.deepEqual(parseYahooChart(body), { price: 259.45, currency: "USD" });
  // Respuestas degradadas reales de la API.
  assert.deepEqual(parseYahooChart({ chart: { error: "Not found" } }), { price: null, currency: null });
  assert.deepEqual(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }), {
    price: null,
    currency: null,
  });
  assert.deepEqual(parseYahooChart(null), { price: null, currency: null });
});

test("parseStooqCsv lee el cierre con o sin encabezado, y respeta N/D", () => {
  const withHeader =
    "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-10-09,16:00:00,182.34,183.06,181.06,183.05,50759583\n";
  assert.deepEqual(parseStooqCsv(withHeader, "aapl.us"), { price: 183.05, currency: "USD" });
  assert.deepEqual(parseStooqCsv(withHeader.split("\n")[1] ?? "", "aapl.us"), {
    price: 183.05,
    currency: "USD",
  });
  // Sin sufijo de mercado la divisa es desconocida: no se inventa.
  assert.deepEqual(parseStooqCsv(withHeader, "sap"), { price: 183.05, currency: null });
  // Stooq marca N/D cuando no tiene el dato.
  assert.deepEqual(parseStooqCsv("Symbol,Close\nZZZ.US,N/D\n", "zzz.us"), {
    price: null,
    currency: "USD",
  });
  assert.deepEqual(parseStooqCsv("", "aapl.us"), { price: null, currency: null });
});

test("parseFxRates y toUsd convierten solo con divisa conocida", () => {
  const rates = parseFxRates({ base: "USD", rates: { EUR: 0.86, GBP: 0.74, JPY: 0 } });
  assert.deepEqual(rates, { EUR: 0.86, GBP: 0.74 });
  assert.equal(parseFxRates({}), null);
  assert.equal(toUsd(100, "EUR", rates), 100 / 0.86);
  assert.equal(toUsd(100, "USD", rates), 100);
  assert.equal(toUsd(100, null, rates), 100);
  assert.equal(toUsd(100, "MXN", rates), null); // sin tipo de cambio: no se inventa
  assert.equal(toUsd(null, "EUR", rates), null);
});

test("fetchQuote usa Yahoo y cachea el resultado", async () => {
  const calls = stubFetch({
    "https://query1.finance.yahoo.com": {
      body: { chart: { result: [{ meta: { regularMarketPrice: 259.45, currency: "USD" } }] } },
    },
  });
  const first = await fetchQuote("AAPL");
  assert.equal(first.source, "yahoo");
  assert.equal(first.price, 259.45);
  const second = await fetchQuote("aapl"); // misma clave normalizada
  assert.equal(second.price, 259.45);
  assert.equal(calls.length, 1, "la segunda lectura debe salir de la caché");
  assert.ok(memoryGet("quote:AAPL", TTL_MS.quote), "la caché guarda la cotización");
});

test("fetchQuote cae a Stooq cuando Yahoo responde 403", async () => {
  const calls = stubFetch({
    "https://query1.finance.yahoo.com": { status: 403 },
    "https://stooq.com/q/l/?s=aapl.us": {
      text: "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-10-09,16:00:00,1,2,3,183.05,100\n",
    },
  });
  const quote = await fetchQuote("AAPL");
  assert.equal(quote.source, "stooq");
  assert.equal(quote.price, 183.05);
  assert.equal(quote.currency, "USD");
  assert.equal(calls.length, 2);
});

test("fetchQuote no lanza cuando ninguna fuente responde", async () => {
  stubFetch({ "https://query1.finance.yahoo.com": { status: 500 }, "https://stooq.com": { status: 500 } });
  const quote = await fetchQuote("NOPE");
  assert.deepEqual(
    { price: quote.price, currency: quote.currency, source: quote.source },
    { price: null, currency: null, source: "none" },
  );
});

test("fetchQuoteWithUsd convierte solo cuando hace falta", async () => {
  stubFetch({
    "https://query1.finance.yahoo.com": {
      body: { chart: { result: [{ meta: { regularMarketPrice: 100, currency: "EUR" } }] } },
    },
    "https://api.frankfurter.app": { body: { base: "USD", rates: { EUR: 0.5 } } },
  });
  const converted = await fetchQuoteWithUsd("SAP");
  assert.equal(converted.currency, "EUR");
  assert.equal(converted.priceUsd, 200);

  memoryClear();
  stubFetch({
    "https://query1.finance.yahoo.com": {
      body: { chart: { result: [{ meta: { regularMarketPrice: 259.45, currency: "USD" } }] } },
    },
  });
  const plain = await fetchQuoteWithUsd("AAPL");
  assert.equal(plain.priceUsd, 259.45);
});
