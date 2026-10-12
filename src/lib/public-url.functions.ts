import { createServerFn } from "@tanstack/react-start";
import { resolvePublicOrigin } from "./public-url";

/**
 * Origen público de la app, resuelto en el servidor.
 *
 * El QR no se puede construir con el host de quien lo pinta: si el visitante
 * entra por un proxy (el preview, un dominio propio, un rewrite), el navegador
 * ve una dirección y el servidor otra. Aquí manda el servidor, que es el único
 * que ve las cabeceras de la petición de verdad.
 *
 * El mismo handler sirve para el primer render y para la navegación del
 * cliente, así que el QR no cambia al hidratar. `VITE_PUBLIC_HOSTNAME` gana
 * cuando existe porque un despliegue publicado pasa por Envoy, que reescribe
 * el `Host`.
 */
export const getPublicOrigin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [server, environment] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("./env.server"),
    ]);
    const headers = server.getRequestHeaders();
    return resolvePublicOrigin({
      envHostname: environment.env("VITE_PUBLIC_HOSTNAME"),
      requestHost: headers.get("x-forwarded-host") ?? headers.get("host"),
      requestProto: headers.get("x-forwarded-proto"),
    });
  } catch {
    // Sin cabeceras (pruebas, llamadas fuera de una petición) se devuelve vacío
    // y el panel cae al origen del navegador.
    return "";
  }
});
