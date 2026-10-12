-- Índices: decisión medida, no supuesta.
--
-- Cada índice de esta app se validó con EXPLAIN (ANALYZE, BUFFERS) sobre las
-- consultas reales de src/lib/market.functions.ts, en Postgres embebido
-- (PGLite) y al volumen que la app puede alcanzar. Reproducible con:
--
--     npm run db:index-check        (scripts/index-check.mjs)
--
-- Resultados que motivan este archivo (11,000 filas en market_cache; scan_log
-- medido con su poda real de 400 filas y sin poda, a 50,000):
--
--   market_cache_pkey (ticker)        0.02 ms por escaneo. Es la PK: obligatoria.
--   market_cache_fetched_idx          4.0–4.7× en el barrido de retención
--                                     (1.03 ms → 4.10 ms sin él). Se queda, y
--                                     ahora hay una consulta que lo usa.
--   scan_log_scanned_idx              8.8× con 400 filas y 885× con 50,000 en el
--                                     historial (0.046 ms → 40.7 ms sin él).
--                                     Se queda tal cual.
--   índice "cubridor" con INCLUDE     0.9–1.0× frente al actual: no mide nada y
--                                     cuesta escrituras y espacio. No se añade.
--   scan_log_ticker_idx               Ninguna consulta de la app filtra por
--                                     ticker: era costo de escritura sin
--                                     beneficio. Se elimina abajo.

-- 1) Fuera el índice huérfano. La única consulta por ticker sería
--    "historial de un ticker", que la app no ofrece; si algún día se agrega,
--    este archivo es el lugar para volver a crearlo con su medición.
drop index if exists scan_log_ticker_idx;

-- 2) Los dos que sí se usan, afirmados de forma idempotente para que una base
--    nueva (donde 0002 ya los creó) y una base antigua converjan al mismo
--    esquema. Sin el índice de fetched_at el barrido de retención recorre la
--    tabla completa en cada limpieza.
create index if not exists market_cache_fetched_idx on market_cache (fetched_at desc);
create index if not exists scan_log_scanned_idx on scan_log (scanned_at desc);
