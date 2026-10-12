# ScannerStock

Diagnóstico fundamental estricto. La aplicación lee filings anuales públicos de la SEC, detecta el modelo de negocio y aplica solo las reglas de ese modelo.

No es recomendación de inversión.

## Qué consulta

- SEC EDGAR, sin llave: padrón de tickers, submissions y company facts XBRL.
- Precio de referencia opcional. No entra en el veredicto.
- Si la SEC limita la red, Apple conserva el filing FY2025 ya capturado. No se inventan cifras.

## Qué no hace

No envía cifras a modelos externos, automatizaciones ni rastreadores. El diagnóstico corre dentro de la aplicación.

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

### Detalles que conviene no romper

- `scripts/copy-runtime-assets.mjs` copia `pglite.wasm` / `pglite.data` /
  `initdb.wasm` junto al chunk empaquetado: el bundler no los traza y, sin
  ellos, la función muere al arrancar (PGLite rechaza internamente y Node sale
  del proceso). El paso falla el build si detecta el uso sin poder entregarlos.
- `server/middleware/unhandled-rejection-guard.ts` evita que un rejection
  interno de una dependencia tumbe la función entera en producción.
- Verificación local: `npm run build`, `npm run preview` y
  `node scripts/copy-runtime-assets.mjs --dry-run`.
