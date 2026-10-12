/**
 * Middleware global de cabeceras de seguridad (CSP, nosniff, referrer, HSTS…).
 *
 * Nitro registra automáticamente todo `server/middleware/*` porque
 * `vite.config.ts` fija `serverDir: "./server"`. Las cabeceras se aplican por
 * dos vías, para que ninguna respuesta se quede sin ellas:
 *
 *   1. en `event.res.headers`, que h3 fusiona con la respuesta final aunque
 *      responda otro middleware;
 *   2. envolviendo la respuesta que devuelve `next()`.
 *
 * El cálculo vive en `server/security-headers.ts` y está probado en
 * `server/security-headers.test.ts`.
 */
import { securityHeaders, securityInputFor, withSecurityHeaders } from "../security-headers";

interface SecurityEvent {
  url: URL;
  req: { headers: Headers };
  res?: { headers?: Headers };
}

export default async function securityHeadersMiddleware(
  event: SecurityEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const input = securityInputFor(event);
  for (const [name, value] of Object.entries(securityHeaders(input))) {
    event.res?.headers?.set(name, value);
  }
  const result = await next();
  return result instanceof Response ? withSecurityHeaders(result, input) : result;
}
