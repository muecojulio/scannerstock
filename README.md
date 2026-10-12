# ScannerStock

Diagnóstico fundamental estricto. La aplicación lee filings anuales públicos de la SEC, detecta el modelo de negocio y aplica solo las reglas de ese modelo.

No es recomendación de inversión.

## Qué consulta

Todo son fuentes públicas que no piden llave ni registro:

| Fuente | Para qué | Dónde |
| --- | --- | --- |
| SEC EDGAR (`www.sec.gov`, `data.sec.gov`) | padrón de emisores, submissions y company facts XBRL. Es la fuente del diagnóstico. | `src/lib/market.functions.ts` |
| Yahoo Finance (`query1.finance.yahoo.com`) | precio de referencia (intento 1). | `src/lib/finance/quote.ts` |
| Stooq (`stooq.com`, CSV abierto) | precio de referencia (intento 2, si Yahoo no responde). | `src/lib/finance/quote.ts` |
| frankfurter.app / open.er-api | tipo de cambio del día, solo para expresar en USD un precio en otra divisa. | `src/lib/finance/quote.ts` |
| GitHub público `bigspotteddog/SIC-Codes` | tabla oficial SIC (grupo mayor + división) para enrutar el modelo cuando la SEC no trae descripción. | `src/lib/finance/sic-data.ts` |

- El precio es contexto: **no entra en el veredicto**.
- Si la SEC limita la red o no responde, Apple conserva el filing FY2025 ya capturado. No se inventan cifras.
- La tabla SIC se **versiona** en el repo (no se consulta en runtime): `npm run vendor:sic` la regenera desde GitHub y `npm run vendor:sic:check` verifica que no haya derivado. Son datos del SIC Manual de la OSHA (gobierno de EE. UU., dominio público).

## Qué no hace

No envía cifras a modelos externos, automatizaciones ni rastreadores. El diagnóstico corre dentro de la aplicación.

## Caché

Tres capas, de más rápida a más durable (`src/lib/cache.ts`):

1. **Memoria del proceso** — informe ya calculado (10 min), precio (5 min), tipo de cambio (24 h), padrón de la SEC (12 h). Evita red y recálculo en la instancia caliente.
2. **`market_cache` en Postgres** — compartida entre instancias y despliegues; vive 12 h y se sirve.
3. **`samples`** — filing capturado, último recurso si la SEC no responde.

Una copia vencida **no bloquea**: se sirve al instante y se renueva en segundo plano
(stale-while-revalidate), con un candado por ticker para que diez visitantes no
disparen diez descargas a la SEC. En un serverless la instancia puede morir antes
de terminar; la siguiente petición reintenta.

Retención: las copias con más de 30 días sin actualizarse se borran (barrido cada
hora por instancia) y el historial se poda a 400 lecturas en cada escritura.

## Índices

Decididos con `EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas reales, no de
oído. Reproducible: **`npm run db:index-check`** (levanta Postgres embebido,
carga 11,000 emisores y mide cada índice puesto y quitado).

| Índice | Veredicto medido |
| --- | --- |
| `market_cache_pkey (ticker)` | obligatorio: 0.02 ms por escaneo. |
| `market_cache_fetched_idx (fetched_at desc)` | 3.8–5.5× en el barrido de retención. |
| `scan_log_scanned_idx (scanned_at desc)` | 8.4× con 400 filas y 785× con 50,000 en el historial. |
| índice cubridor con `INCLUDE (ticker, model, verdict)` | 0.9–1.0×: no mide nada y cuesta escrituras. **No se añadió.** |
| `scan_log_ticker_idx (ticker)` | ninguna consulta lo usaba. **Eliminado** en `migrations/0003_indexes.sql`. |

## Interfaz e interacciones

Un sistema, no parches por pantalla. Todo vive en dos sitios y se reutiliza:

| Dónde | Qué hay |
| --- | --- |
| `src/styles.css` | tokens (color, sombra, movimiento, radios), capa base (foco, tacto, scroll) y la capa de componentes: `.btn`, `.chip`, `.surface`, `.tab-list`/`.tab-indicator`, `.lane*`, `.swipe-row`/`.swipe-content`, `.field`, `.badge`, `.skeleton`, `.stage*`, `.nav-pill`, `.meter`. |
| `src/components/ui/*` | `action-button` (inactivo, cargando, éxito, error, apagado), `tabs` (patrón APG con píldora deslizante y swipe), `lane` (`ChipLane` como grupo de radios y `Lane` de tarjetas), `swipe-row` (acciones al deslizar, con botón explícito), `combobox` (búsqueda sin acentos ni mayúsculas), `field` (`TextField`, `SwitchField`, `Disclosure`), `motion` (`Reveal`, `SpotlightCard`) y `status` (región en vivo, giro, esqueleto, insignia, medidor). |
| `src/lib/ui/gestures.ts` | reglas puras y probadas: eje del gesto (proporción 1.2, distancia y velocidad), controles que nunca inician gesto, umbral de apertura de una fila, paso de foco en pestañas (flechas, Inicio, Fin), normalización de texto y bordes de desbordamiento de un carril. |
| `src/lib/ui/hooks.ts` | `useIndicator` (mueve la píldora midiendo el elemento activo), `useLaneEdges`, `useSwipeGesture` (bloqueo de eje, recorte, clic suprimido tras arrastrar), `useActionStatus`, `useInView`, `useOutsidePointer`, `usePrefersReducedMotion`. |

Decisiones que conviene no deshacer:

- **Objetivos táctiles de 44 px** en botones, chips, botones de icono y controles de carril. El estado activo de un chip nunca es solo color: cambia borde, peso, halo y, si lleva icono, la marca.
- **Nada depende del `hover`**: la elevación se declara solo en `@media (hover: hover) and (pointer: fine)` y la respuesta al toque es hundimiento, escala corta y sombra más corta.
- **Estados de acción anunciados**: `aria-busy` mientras carga (sin `disabled`, para no perder el foco), icono y texto en éxito y error, sacudida discreta en el error y región en vivo (`role="status"`; `role="alert"` en el aviso de error).
- **El swipe nunca es la única puerta**: cada fila deslizable lleva un botón visible (⋯) con `aria-expanded`, y en escritorio las acciones se muestran directamente. Las acciones ocultas están `inert` y `aria-hidden`.
- **`touch-action` con cuidado**: `pan-y` se declara solo en los paneles de pestañas y en las filas deslizables, que no alojan carriles. No se pone en `<main>` a propósito: el comportamiento táctil efectivo es la intersección con los ancestros hasta el contenedor de scroll, y un `pan-y` en la página dejaría a los carriles de dentro sin desplazamiento nativo con el dedo.
- **Carriles nativos**: `scroll-snap` moderado, barra oculta solo visualmente, indicadores de desbordamiento que aparecen únicamente cuando hay contenido fuera, y centrado de la opción activa (inmediato con movimiento reducido).
- **Movimiento reducido**: un solo bloque al final de `src/styles.css` apaga animaciones y transiciones decorativas y deja el contenido visible; los estados siguen existiendo aunque no se animen.
- **Sin dependencias nuevas**: las animaciones son CSS más tres hooks; los únicos primitivos externos son Radix Switch y los iconos de Lucide, que ya estaban.

La lógica de negocio no se tocó: mismas reglas (`src/lib/finance/*`), mismas fuentes, mismo `scanTicker`. Lo único que se añadió es `src/lib/finance/verdict.ts` (tono, etiqueta corta y severidad del veredicto, antes repetidos en cada pantalla) y un `prefill` en `src/lib/desk.ts` para que el historial pueda pedir un reescaneo.

## Seguridad

- **Cabeceras** (`server/security-headers.ts`, probado en `server/security-headers.test.ts`): CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (cámara, micrófono y geolocalización desactivados), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` y HSTS cuando la petición llega por HTTPS. Las pone el middleware de Nitro en producción y un plugin de Vite en dev/preview, porque el manifiesto PWA responde antes que Nitro.
- **CSP con `'unsafe-inline'` en `script-src`**: TanStack Start inyecta el estado de hidratación en línea y `frame-ancestors` (no `X-Frame-Options`) porque la app se embebe en el preview.
- **Límite de peticiones por IP** en ventana deslizante (24 escaneos, 40 búsquedas y 60 lecturas de historial por minuto), tomando el último salto de `x-forwarded-for`, que es el que pone el proxy. Antes el contador era global: un visitante insistente bloqueaba a todos.
- **SQL siempre parametrizado**, ticker validado con patrón estricto antes de viajar a una URL externa, y sin `eval` ni HTML sin escapar.
- `npm audit`: 0 vulnerabilidades. Se quitaron 38 dependencias sin uso (118 paquetes menos instalados), que es superficie de ataque que no existía.
- `server/middleware/unhandled-rejection-guard.ts` evita que un rejection interno tumbe la función entera.

## Privacidad

La política completa vive en la ruta **`/privacidad`** (`src/routes/privacidad.tsx`),
enlazada desde la cabecera: qué se guarda, qué se consulta, retención, derechos
ARCO y medidas de seguridad.

## Publicar en Vercel

El deploy no necesita adaptador propio: `npm run build` termina en
`node scripts/copy-runtime-assets.mjs && npm run db:migrate` y emite
`.vercel/output` en formato **Build Output API v3** (preset `vercel` de Nitro):
los estáticos en `static/` y una función Node 24 en `functions/__server.func`.
Vercel consume ese directorio tal cual lo genera el build.

`vercel.json` deja el deploy determinado:

- `framework: null` → preset "Other": Vercel solo ejecuta los comandos y consume
  `.vercel/output`, sin que la autodetección (Vite/TanStack) imponga un `dist`.
- `buildCommand: npm run build` e `installCommand` con `--omit=dev` (verificado:
  el build no necesita devDependencies y así no descarga Playwright).
- La versión de Node sale de `engines.node` (`24.x`), que Vercel respeta por
  encima del ajuste del dashboard.

Pasos: importar el repositorio en Vercel y dejar que el push construya. No hay
que tocar nada más en el dashboard.

### Variables de entorno

| Variable | Efecto |
| --- | --- |
| `DATABASE_URL` | Postgres real (p. ej. Neon). **Recomendada**: con ella `npm run build` aplica `migrations/*.sql` y el historial persiste. Sin ella la función arranca un Postgres embebido (PGLite) en memoria: la app funciona, pero cada instancia empieza vacía. |
| `VITE_AUTH_ENABLED` | La app no tiene login activo. Ponerlo a `"false"` lo fuerza apagado; dejarlo ausente lo activa (requiere el resto de credenciales). |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GROK_AUTH_*` | Solo si se activa el sign-in federado. |
| `VITE_PUBLIC_HOSTNAME` | Dominio público publicado; da URLs absolutas a las tarjetas OG. |

Ninguna fuente de datos requiere variables: SEC, Yahoo, Stooq, los tipos de
cambio y la tabla SIC funcionan sin llave.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` / `npm run build` / `npm run preview` | desarrollo, build de Vercel y preview local. |
| `npm test` | 116 pruebas, ninguna omitida (finanzas, SIC, veredicto, gestos de interfaz, cotizaciones, cabeceras, migraciones, scripts). |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` y ESLint. |
| `npm run db:index-check` | mide con EXPLAIN si cada índice conviene. |
| `npm run vendor:sic` / `vendor:sic:check` | regenera / verifica la tabla SIC desde GitHub. |
| `npm run check:auth` | invariante del andamiaje de auth. |

### Detalles que conviene no romper

- `scripts/copy-runtime-assets.mjs` copia `pglite.wasm` / `pglite.data` /
  `initdb.wasm` junto al chunk empaquetado: el bundler no los traza y, sin
  ellos, la función muere al arrancar (PGLite rechaza internamente y Node sale
  del proceso). El paso falla el build si detecta el uso sin poder entregarlos.
- `server/middleware/unhandled-rejection-guard.ts` evita que un rejection
  interno de una dependencia tumbe la función entera en producción.
- Verificación local: `npm run build`, `npm run preview` y
  `node scripts/copy-runtime-assets.mjs --dry-run`.
