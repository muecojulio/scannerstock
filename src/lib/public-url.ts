/**
 * Dirección pública de la app: la que se codifica en el QR y la que se copia
 * o se comparte. Es una función pura a propósito, porque decide a dónde apunta
 * un código que se puede imprimir: si elige mal el host, el QR manda a la nada.
 *
 * Orden de preferencia:
 *
 *   1. `VITE_PUBLIC_HOSTNAME` — el dominio publicado que inyecta el despliegue.
 *      Cuando existe, es la verdad: la petición puede llegar por un proxy con
 *      otro nombre.
 *   2. La cabecera de la petición (`x-forwarded-host` y, si falta, `host`) con
 *      su protocolo. Es lo que ve un visitante del preview o del dominio propio.
 *   3. El origen del navegador, cuando el código corre en el cliente y el
 *      servidor no supo resolver nada.
 *
 * Solo se aceptan nombres con forma de host (letras, dígitos, puntos, guiones y
 * un puerto opcional). Cualquier otra cosa —vacío, espacios, cabeceras con
 * saltos de línea— se descarta en lugar de acabar dentro del QR.
 */

export type PublicOriginInput = {
  /** Host publicado por el despliegue (`VITE_PUBLIC_HOSTNAME`). */
  envHostname?: string | null;
  /** `x-forwarded-host` o `host` de la petición en curso. */
  requestHost?: string | null;
  /** `x-forwarded-proto` de la petición en curso. */
  requestProto?: string | null;
  /** `window.location.origin`, cuando ya estamos en el navegador. */
  browserOrigin?: string | null;
};

const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?$/;

/** El host de la cabecera, limpio, o `""` si no sirve. */
export function cleanHostHeader(value: unknown): string {
  const first = String(value ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (!first) return "";
  if (!HOST_PATTERN.test(first)) return "";
  return first;
}

/** Un host local (o una IP) no puede anunciarse con HTTPS. */
export function isLocalHost(host: string): boolean {
  const name = host.split(":")[0] ?? "";
  return (
    name === "localhost" ||
    name === "127.0.0.1" ||
    name === "0.0.0.0" ||
    name === "[::1]" ||
    IPV4_PATTERN.test(host)
  );
}

/** `https://host`, o `http://` cuando el destino es local y no se dice otra cosa. */
export function originFromHost(host: string, proto?: string | null): string {
  if (!host) return "";
  const protocol = String(proto ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const secure = protocol === "https" ? true : protocol === "http" ? false : !isLocalHost(host);
  return `${secure ? "https" : "http"}://${host}`;
}

/** Origen válido a partir de una URL completa (o `""`). */
export function normalizeOrigin(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

/** Resuelve el origen público con la primera fuente que sirva. */
export function resolvePublicOrigin(input: PublicOriginInput): string {
  const fromEnv = cleanHostHeader(input.envHostname);
  if (fromEnv) return originFromHost(fromEnv);

  const fromRequest = cleanHostHeader(input.requestHost);
  if (fromRequest) return originFromHost(fromRequest, input.requestProto);

  return normalizeOrigin(input.browserOrigin);
}

/**
 * Enlace que se comparte y se codifica: el origen con barra final. La barra
 * evita un salto de redirección y deja el enlace igual de legible en un cartel.
 */
export function sharedAppUrl(origin: string): string {
  const clean = String(origin ?? "").trim().replace(/\/+$/, "");
  return clean ? `${clean}/` : "";
}
