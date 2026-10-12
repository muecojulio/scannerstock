#!/usr/bin/env node
/**
 * ¿Conviene cada índice? Medición, no opinión.
 *
 *   npm run db:index-check
 *
 * Arranca un Postgres embebido (PGLite, el mismo motor del fallback de dev),
 * aplica `migrations/*.sql`, carga filas sintéticas al volumen que la app puede
 * alcanzar y corre `EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas REALES del
 * código — las de `src/lib/market.functions.ts` — con cada índice candidato
 * puesto, quitado o sustituido. Imprime el plan elegido y el mejor tiempo de 5
 * corridas para que la decisión quede documentada con números.
 *
 * No toca la base de producción: todo vive en memoria y muere con el proceso.
 * Ajustes: MARKET_ROWS, SCAN_ROWS, SCAN_ROWS_UNBOUNDED.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Volumen realista: el padrón público de la SEC ronda los 11k emisores. */
const MARKET_ROWS = Number(process.env.MARKET_ROWS ?? 11_000);
/** scan_log está podado a 400 filas por código; se mide también sin esa poda. */
const SCAN_ROWS = Number(process.env.SCAN_ROWS ?? 400);
const SCAN_ROWS_UNBOUNDED = Number(process.env.SCAN_ROWS_UNBOUNDED ?? 50_000);

/**
 * Consultas que el código ejecuta de verdad.
 * `index` es el que hoy existe; `alternative` (opcional) sustituye a ese para
 * medir si otra forma rinde más.
 */
const PROBES = [
  {
    name: "lectura de caché por ticker (corre en cada escaneo)",
    table: "market_cache",
    index: "market_cache_pkey",
    sql: "select company_name, sic, sic_description, snapshot, price, price_currency, fetched_at from market_cache where ticker = 'AAPL' limit 1",
  },
  {
    name: "barrido de retención: copias viejas de market_cache",
    table: "market_cache",
    index: "market_cache_fetched_idx",
    sql: "select ticker from market_cache where fetched_at < now() - interval '30 days'",
  },
  {
    name: "historial: últimas 20 lecturas",
    table: "scan_log",
    index: "scan_log_scanned_idx",
    alternative:
      "create index scan_log_scanned_idx on scan_log (scanned_at desc) include (ticker, model, verdict)",
    sql: "select ticker, model, verdict, scanned_at from scan_log order by scanned_at desc limit 20",
  },
  {
    name: "poda de scan_log a las últimas 400 filas",
    table: "scan_log",
    index: "scan_log_scanned_idx",
    sql: "select id from scan_log order by scanned_at desc offset 400",
  },
  {
    name: "lecturas de un ticker (consulta que la app NO hace)",
    table: "scan_log",
    index: "scan_log_ticker_idx",
    sql: "select ticker, model, verdict, scanned_at from scan_log where ticker = 'AAPL' order by scanned_at desc limit 20",
  },
];

async function applyMigrations(pg) {
  const dir = join(root, "migrations");
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) await pg.exec(readFileSync(join(dir, file), "utf8"));
  return files;
}

async function seed(pg, marketRows, scanRows) {
  await pg.exec("truncate market_cache, scan_log");
  const chunk = 500;
  for (let i = 0; i < marketRows; i += chunk) {
    const rows = [];
    for (let j = i; j < Math.min(i + chunk, marketRows); j += 1) {
      const ticker = j === 0 ? "AAPL" : `T${String(j).padStart(5, "0")}`;
      // 10% de copias viejas: el barrido de retención tiene trabajo real.
      const ageDays = j % 10 === 0 ? 45 : 1;
      rows.push(
        `('${ticker}', 'Empresa ${j}', ${3000 + (j % 900)}, 'Grupo', '{"revenue":[]}'::jsonb, ${100 + (j % 50)}, 'USD', now() - interval '${ageDays} days')`,
      );
    }
    await pg.exec(
      `insert into market_cache (ticker, company_name, sic, sic_description, snapshot, price, price_currency, fetched_at) values ${rows.join(",")}`,
    );
  }
  for (let i = 0; i < scanRows; i += chunk) {
    const rows = [];
    for (let j = i; j < Math.min(i + chunk, scanRows); j += 1) {
      rows.push(
        `('T${String(j % 900).padStart(5, "0")}', ${1 + (j % 4)}, 'BIEN', now() - interval '${j} seconds')`,
      );
    }
    await pg.exec(`insert into scan_log (ticker, model, verdict, scanned_at) values ${rows.join(",")}`);
  }
  await pg.exec("analyze market_cache");
  await pg.exec("analyze scan_log");
}

async function rowsOf(pg, sql, params) {
  const result = await pg.query(sql, params);
  return result.rows ?? result;
}

/** Corre la sonda varias veces y se queda con el mejor tiempo (una sola corrida hace ruido). */
async function measure(pg, sql, runs = 5) {
  let best = Infinity;
  let plan = "";
  for (let i = 0; i < runs; i += 1) {
    const rows = await rowsOf(pg, `explain (analyze, buffers, timing on) ${sql}`);
    const lines = rows.map((r) => Object.values(r)[0]);
    const ms = Number(
      (lines.find((l) => /Execution Time:/.test(l)) ?? "").match(/([\d.]+) ms/)?.[1] ?? NaN,
    );
    if (Number.isFinite(ms) && ms < best) best = ms;
    if (i === runs - 1) plan = String(lines[0] ?? "").trim();
  }
  return { ms: best, plan };
}

async function indexDdl(pg, name) {
  const rows = await rowsOf(pg, "select indexdef from pg_indexes where indexname = $1", [name]);
  return rows[0]?.indexdef ?? "";
}

/** Un índice que respalda una PK/UNIQUE no se puede quitar: es la restricción. */
async function backsConstraint(pg, name) {
  const rows = await rowsOf(
    pg,
    "select 1 from pg_constraint c join pg_class i on i.oid = c.conindid where i.relname = $1",
    [name],
  );
  return rows.length > 0;
}

const nf = (n) => n.toLocaleString("en-US");
const pg = new PGlite();
await pg.waitReady;
process.stdout.write(`Migraciones: ${(await applyMigrations(pg)).join(", ")}\n`);

const results = [];
for (const scanRows of [SCAN_ROWS, SCAN_ROWS_UNBOUNDED]) {
  process.stdout.write(`\n=== ${nf(MARKET_ROWS)} filas en market_cache · ${nf(scanRows)} en scan_log ===\n`);
  await seed(pg, MARKET_ROWS, scanRows);

  for (const probe of PROBES) {
    const ddl = await indexDdl(pg, probe.index);
    if (!ddl) {
      results.push({ probe, scanRows, note: "el índice no existe en el esquema (lo quitó una migración o nunca se creó)" });
      continue;
    }
    const entry = { probe, scanRows, ddl };
    entry.withIndex = await measure(pg, probe.sql);

    if (await backsConstraint(pg, probe.index)) {
      entry.note = "respalda una restricción: no se puede quitar (y no conviene)";
    } else {
      await pg.exec(`drop index ${probe.index}`);
      await pg.exec("analyze");
      entry.withoutIndex = await measure(pg, probe.sql);
      if (probe.alternative) {
        await pg.exec(probe.alternative);
        await pg.exec("analyze");
        entry.alternative = await measure(pg, probe.sql);
        await pg.exec(`drop index ${probe.index}`);
      }
      await pg.exec(ddl);
      await pg.exec("analyze");
    }

    entry.speedup = entry.withoutIndex ? entry.withoutIndex.ms / entry.withIndex.ms : null;
    results.push(entry);

    process.stdout.write(`\n• ${probe.name}\n  ${ddl}\n  con índice    ${entry.withIndex.ms.toFixed(3)} ms — ${entry.withIndex.plan}\n`);
    if (entry.withoutIndex) {
      process.stdout.write(
        `  sin índice    ${entry.withoutIndex.ms.toFixed(3)} ms — ${entry.withoutIndex.plan}\n` +
          `  ganancia      ${entry.speedup.toFixed(1)}× (${(entry.withoutIndex.ms - entry.withIndex.ms).toFixed(3)} ms)\n`,
      );
    } else {
      process.stdout.write(`  sin índice    — ${entry.note}\n`);
    }
    if (entry.alternative) {
      process.stdout.write(
        `  alternativa   ${entry.alternative.ms.toFixed(3)} ms — ${probe.alternative}\n` +
          `                ${(entry.withIndex.ms / entry.alternative.ms).toFixed(1)}× vs el índice actual\n`,
      );
    }
  }
}

process.stdout.write("\n=== Resumen ===\n");
for (const r of results) {
  const scale = `${nf(r.scanRows)} filas scan_log`;
  if (!r.withIndex) {
    // Índice que el esquema ya no tiene (p. ej. eliminado por una migración):
    // la sonda queda documentada para cuando alguien quiera volver a crearlo.
    process.stdout.write(`${r.probe.index} [${scale}] NO EXISTE en el esquema — ${r.note}\n`);
    continue;
  }
  if (r.note && !r.withoutIndex) {
    process.stdout.write(`${r.probe.index} [${scale}] ${r.note} — ${r.withIndex.ms.toFixed(3)} ms\n`);
    continue;
  }
  const verdict = r.speedup >= 2 ? "CONVIENE" : r.speedup >= 1.15 ? "marginal" : "no aporta";
  process.stdout.write(
    `${r.probe.index} [${scale}] ${verdict} — ${r.withIndex.ms.toFixed(3)} ms con / ${r.withoutIndex.ms.toFixed(3)} ms sin (${r.speedup.toFixed(1)}×)\n`,
  );
}
await pg.close();
