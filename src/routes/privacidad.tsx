import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, FileText, ShieldCheck } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { SpotlightCard } from "@/components/ui/motion";
import { Badge } from "@/components/ui/status";

const UPDATED = "12 de octubre de 2026";
const CONTACT = "muecojulio@users.noreply.github.com";
const REPO = "https://github.com/muecojulio/scannerstock";

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Quién responde por esta aplicación",
    body: [
      `ScannerStock es una aplicación de diagnóstico fundamental que corre en este teléfono y en una función de servidor. El responsable del tratamiento es el autor del proyecto, localizable en ${CONTACT} y en el repositorio público ${REPO}.`,
      "No hay empresa detrás, ni encargado de tratamiento, ni cesión de datos a terceros con fines comerciales.",
    ],
  },
  {
    title: "2. Lo que no se recoge",
    body: [
      "No se pide cuenta, correo ni contraseña: la aplicación no tiene registro activo. No se instalan cookies de sesión ni de rastreo, no hay analítica, no hay píxeles de publicidad y no se envían tus cifras a modelos de inteligencia artificial, automatizaciones ni servicios de terceros para que las interpreten.",
      "El diagnóstico se calcula con reglas fijas dentro de la aplicación. Nadie más ve lo que capturas.",
    ],
  },
  {
    title: "3. Lo que guarda el servidor",
    body: [
      "La base compartida guarda únicamente datos de emisoras públicas, nunca de personas: el ticker, el nombre público de la empresa, su código de industria SIC con la descripción, las series contables ya resumidas del filing anual, el precio de referencia con su divisa y la fecha de la lectura.",
      "El historial público guarda el ticker, el número de modelo aplicado, el veredicto y la fecha. Conserva como máximo las últimas 400 lecturas y no identifica a quién escaneó: no hay identificador de usuario, ni sesión, ni perfil.",
      "No se guardan notas personales, ni el JSON de métricas que pegues, ni las cifras que captures a mano. Eso vive solo en este teléfono, en el último informe.",
    ],
  },
  {
    title: "4. Lo que guarda tu dispositivo",
    body: [
      "El navegador conserva una sola clave de almacenamiento local (`scannerstock-last`) con el último informe generado, para que puedas volver a él sin repetir la descarga. No caduca sola: se borra cuando limpias los datos del sitio o el almacenamiento del navegador. Ninguna otra aplicación ni página puede leerla.",
    ],
  },
  {
    title: "5. Fuentes públicas consultadas",
    body: [
      "Las consultas salen del servidor de la aplicación, no de tu navegador, y ninguna fuente pide llave ni registro:",
      "• SEC EDGAR (data.sec.gov y www.sec.gov): padrón de emisores, submissions y hechos XBRL. Es la fuente del diagnóstico. Se identifica con un User-Agent que declara la aplicación y su repositorio, como exige la SEC.",
      "• Yahoo Finance y Stooq: precio de referencia del ticker. Es contexto y no entra en el veredicto.",
      "• frankfurter.app u open.er-api: tipo de cambio del día, solo para expresar en dólares un precio que cotiza en otra divisa.",
      "A esas fuentes se les envía el ticker o el CIK que pediste. No se les envía tu dirección IP, ni tu agente de navegador, ni ningún otro dato tuyo.",
    ],
  },
  {
    title: "6. Dirección IP y límite de peticiones",
    body: [
      "Para evitar el abuso, la aplicación cuenta cuántas búsquedas, escaneos y consultas de historial hace cada dirección IP en una ventana de un minuto. Ese contador vive en la memoria del proceso: no se escribe en disco, no se comparte entre instancias y desaparece cuando la instancia se apaga (minutos).",
      "Los registros del proveedor de alojamiento pueden conservar direcciones IP según su propia política; escapa a esta aplicación.",
    ],
  },
  {
    title: "7. Conservación",
    body: [
      "Una copia de cifras se sirve durante 12 horas y se renueva al siguiente escaneo. Las copias que llevan más de 30 días sin actualizarse se borran automáticamente: ya no podrían servirse.",
      "El historial se poda en cada escritura para no pasar de 400 lecturas. No existe un borrado programado más allá de eso porque no hay datos personales que purgar.",
    ],
  },
  {
    title: "8. Tus derechos",
    body: [
      `Aunque la aplicación no trata datos personales, puedes ejercer en cualquier momento los derechos de acceso, rectificación, supresión, oposición y portabilidad escribiendo a ${CONTACT}. Si quieres que se retire una lectura concreta del historial público, indica el ticker y la fecha aproximada y se elimina.`,
      "También puedes borrar de inmediato lo que depende de ti: el último informe guardado en este teléfono, desde los ajustes de datos del navegador.",
    ],
  },
  {
    title: "9. Seguridad",
    body: [
      "Las comunicaciones van por HTTPS y el servidor responde con cabeceras de endurecimiento: política de seguridad de contenido, `X-Content-Type-Options: nosniff`, política de referer, política de permisos (cámara, micrófono y geolocalización desactivadas) y HSTS cuando la conexión es segura.",
      "Toda consulta a la base es parametrizada (no se concatena texto del usuario en SQL), las entradas se validan antes de usarse y el ticker se restringe a un patrón estricto antes de viajar a una URL externa. El código no usa `eval` ni inserción de HTML sin escapar.",
    ],
  },
  {
    title: "10. Menores",
    body: [
      "La aplicación no está dirigida a menores de edad y no recoge datos de nadie, así que no hay un tratamiento específico que limitar. Aun así, no debe usarse para tomar decisiones financieras por cuenta de un menor.",
    ],
  },
  {
    title: "11. Cambios en esta política",
    body: [
      `Si cambia lo que se guarda o a quién se consulta, esta página se actualiza y se revisa la fecha de la parte superior. Última actualización: ${UPDATED}.`,
    ],
  },
];

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Privacidad · ScannerStock" },
      {
        name: "description",
        content:
          "Qué guarda ScannerStock, qué consulta y qué no toca. Sin cuenta, sin cookies de rastreo y sin enviar tus cifras a terceros.",
      },
    ],
  }),
  component: function Privacidad() {
    const [open, setOpen] = useState<string[]>([SECTIONS[0]?.title ?? ""]);

    return (
      <AppFrame>
        <article className="space-y-4 text-sm leading-relaxed">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="live" icon={ShieldCheck}>
                Sin rastreo
              </Badge>
              <Badge icon={FileText}>Datos públicos</Badge>
            </div>
            <h1 className="font-display text-3xl leading-tight">Política de privacidad</h1>
            <p className="text-xs tracking-wide text-stone">
              Última actualización: {UPDATED} · Contacto: {CONTACT}
            </p>
          </header>

          <SpotlightCard className="p-4" interactive={false}>
            ScannerStock consulta filings anuales públicos de la SEC de Estados Unidos y, si está disponible, el
            precio de mercado de ese mismo ticker. No pide cuenta, no vende datos y no envía tus cifras a modelos de
            inteligencia artificial ni a automatizaciones externas.
          </SpotlightCard>

          {/* Cada apartado se pliega con una altura medida: abrir uno largo no
              da saltos, y el estado accesible va en `aria-expanded`. */}
          <div className="space-y-2">
            {SECTIONS.map((section) => {
              const expanded = open.includes(section.title);
              const panelId = `privacidad-${section.title.slice(0, 2).replace(/\W/g, "")}-panel`;
              return (
                <section key={section.title} className="surface overflow-hidden">
                  <h2>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() =>
                        setOpen((current) =>
                          current.includes(section.title)
                            ? current.filter((title) => title !== section.title)
                            : [...current, section.title],
                        )
                      }
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                    >
                      <span className="min-w-0 flex-1 font-display text-lg leading-tight">{section.title}</span>
                      <ChevronDown
                        size={18}
                        strokeWidth={2}
                        aria-hidden="true"
                        className={`shrink-0 text-stone transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </h2>
                  <div
                    id={panelId}
                    hidden={!expanded}
                    className={`space-y-2 px-4 pb-4 text-ivory/90 ${expanded ? "page-enter" : ""}`}
                  >
                    {section.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <SpotlightCard className="border-clay/40 bg-clay/10 p-4" interactive={false}>
            <h2 className="font-display text-xl">No es asesoría de inversión</h2>
            <p className="mt-2">
              Los umbrales son reglas estrictas: una sola métrica en zona de alerta puede marcar MAL aunque el resto se
              vea sano. Los datos pueden llegar tarde o incompletos; verifica contra el filing oficial antes de tomar
              cualquier decisión.
            </p>
          </SpotlightCard>

          <Link to="/" className="btn btn-primary btn-block">
            Volver a escanear
          </Link>
        </article>
      </AppFrame>
    );
  },
});
