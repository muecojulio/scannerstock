/**
 * Cabeceras de seguridad de la aplicación.
 *
 * La lógica es pura (`securityHeaders`) para poder probarla sin servidor; el
 * middleware de `server/middleware/security-headers.ts` solo la aplica a cada
 * respuesta y `withSecurityHeaders` a las respuestas que otros middlewares
 * devuelven antes de llegar ahí.
 *
 * Decisiones que vale la pena no "arreglar" sin leer esto:
 *
 * - `script-src` lleva `'unsafe-inline'`: TanStack Start inyecta el estado de
 *   hidratación como `<script>` en línea en el HTML servido. Sin nonces (que
 *   exigirían tocar el renderizado del framework) la alternativa es romper la
 *   hidratación. Se permite además `https://grok.com` porque la plataforma
 *   inyecta su propio script (`scripts/grok-pwa-shared.mjs`).
 * - `frame-ancestors` sustituye a `X-Frame-Options`: esta app se embebe en el
 *   preview (iframe de otro origen), y `DENY`/`SAMEORIGIN` lo romperían. En
 *   producción se listan solo los orígenes que de verdad la embeben; en dev se
 *   deja abierto porque el host que monta el iframe cambia con el entorno y un
 *   `frame-ancestors` equivocado deja la vista previa en blanco.
 * - `upgrade-insecure-requests` y HSTS solo sobre HTTPS: enviados por HTTP son
 *   ruido (y HSTS por HTTP se ignora por especificación).
 * - No se toca `Cache-Control`: lo decide cada ruta.
 */

export type SecurityHeaderInput = {
  /** La petición llegó por HTTPS (en Vercel, `x-forwarded-proto`). */
  secure?: boolean;
  /** Build de desarrollo: hace falta el WebSocket de HMR de Vite. */
  dev?: boolean;
};

/** Orígenes que embeben la app en un iframe: el preview y el chrome de Grok. */
const EMBEDDER_ORIGINS = [
  "https://grok.com",
  "https://*.grok.com",
  "https://*.grok-sandbox.com",
  "https://*.e2b.app",
];

/** Script y endpoints de la plataforma, inyectados en el HTML servido. */
const PLATFORM_ORIGIN = "https://grok.com";

export function securityHeaders(input: SecurityHeaderInput = {}): Record<string, string> {
  const { secure = false, dev = false } = input;
  const connectSrc = ["'self'", PLATFORM_ORIGIN, ...(dev ? ["ws:", "wss:"] : [])].join(" ");
  const frameAncestors = dev ? "*" : `'self' ${EMBEDDER_ORIGINS.join(" ")}`;
  const headers: Record<string, string> = {
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${PLATFORM_ORIGIN}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      `connect-src ${connectSrc}`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${frameAncestors}`,
      ...(secure ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
    // Sin esto, un archivo subido como texto y servido como script se ejecuta.
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    // Ni cámara ni micrófono ni geolocalización: la app no los usa.
    "permissions-policy":
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "x-dns-prefetch-control": "off",
    "x-permitted-cross-domain-policies": "none",
  };
  if (secure) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

/** Lo mínimo que necesita el cálculo: la URL y las cabeceras de la petición. */
export type SecurityEventLike = { url: URL; req: { headers: Headers } };

/** Tras un proxy (Vercel) el esquema real llega en `x-forwarded-proto`. */
export function isSecureRequest(event: SecurityEventLike): boolean {
  const forwarded = event.req.headers.get("x-forwarded-proto") ?? "";
  if (forwarded.split(",")[0]?.trim() === "https") return true;
  return event.url.protocol === "https:";
}

/** Parámetros de seguridad deducidos de la petición actual. */
export function securityInputFor(event: SecurityEventLike): SecurityHeaderInput {
  return { secure: isSecureRequest(event), dev: Boolean(import.meta.env?.DEV) };
}

/** Copia la respuesta con las cabeceras de seguridad puestas (no muta la original). */
export function withSecurityHeaders(
  response: Response,
  input: SecurityHeaderInput = {},
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(input))) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
