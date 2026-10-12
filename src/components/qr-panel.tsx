import { useEffect, useMemo, useState } from "react";
import {
  Apple,
  Copy,
  Download,
  ExternalLink,
  Landmark,
  Monitor,
  QrCode as QrIcon,
  Share2,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { QrCode } from "@/components/ui/qr";
import { ActionButton } from "@/components/ui/action-button";
import { Reveal, SpotlightCard } from "@/components/ui/motion";
import { Badge } from "@/components/ui/status";
import { useActionStatus } from "@/lib/ui/hooks";
import { encodeQr } from "@/lib/qr/encode";
import { QR_FILE_NAME, canShareFile, copyText, qrPngBlob, saveBlob, shareFile } from "@/lib/qr/download";
import { qrSvgMarkup } from "@/lib/qr/render";
import { sharedAppUrl } from "@/lib/public-url";

/** Nivel de corrección del QR que se dibuja y se descarga. */
const ECC = "Q" as const;

const STEPS = [
  {
    id: "ios",
    icon: Apple,
    title: "iPhone y iPad",
    body: "Abre la cámara, apunta al QR y entra en Safari. Después: Compartir → Añadir a pantalla de inicio.",
    tutorial: true,
  },
  {
    id: "android",
    icon: Smartphone,
    title: "Android",
    body: "Con Chrome: menú ⋮ → Añadir a pantalla de inicio. Si aparece Instalar aplicación, úsalo: queda como una app.",
    tutorial: false,
  },
  {
    id: "escritorio",
    icon: Monitor,
    title: "Ordenador",
    body: "Se abre en el navegador y ya funciona. Chrome y Edge ofrecen el icono de instalación en la barra de direcciones.",
    tutorial: false,
  },
] as const;

/**
 * Pestaña QR: el enlace público de la app hecho código, y el código hecho
 * archivo.
 *
 * Tres decisiones que valen la pena:
 *
 *   - El QR se dibuja con el origen que resuelve el servidor, pero si el
 *     navegador ve otro (proxy mal configurado) gana el del navegador en cuanto
 *     hidrata: el código tiene que apuntar a donde de verdad está la app.
 *   - Descargar no es un solo camino. Con hoja de compartir (iOS, Android) el
 *     archivo se guarda desde ahí, que es la única forma de que el PNG llegue a
 *     Fotos; sin ella se descarga el archivo directamente.
 *   - El SVG se descarga siempre, se comparta o no: es el que se usa para
 *     imprimir en grande.
 */
export function QrPanel({ origin }: { origin: string }) {
  const [clientOrigin, setClientOrigin] = useState("");
  const [canShare, setCanShare] = useState(false);
  const download = useActionStatus();
  const copy = useActionStatus();
  const share = useActionStatus();
  const vector = useActionStatus();

  useEffect(() => {
    // Nada de `window` durante el render: el HTML del servidor y el del cliente
    // tienen que coincidir. Aquí solo se corrige lo que el servidor no vio.
    setClientOrigin(window.location.origin);
    setCanShare(typeof navigator.share === "function");
  }, []);

  const url = useMemo(() => sharedAppUrl(clientOrigin || origin), [clientOrigin, origin]);
  const code = useMemo(() => (url ? encodeQr(url, { ecc: ECC }) : null), [url]);

  async function onDownload() {
    if (!code) return;
    const blob = await qrPngBlob(code);
    const file = new File([blob], `${QR_FILE_NAME}.png`, { type: "image/png" });
    const result = canShareFile(file) ? await shareFile(file, url) : "unsupported";
    if (result === "cancelled") {
      // Cancelar la hoja de compartir es una decisión, no un fallo.
      download.reset();
      return;
    }
    if (result === "unsupported") saveBlob(blob, `${QR_FILE_NAME}.png`);
    download.succeed();
  }

  async function onShareLink() {
    if (typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: "ScannerStock", text: "Diagnóstico fundamental estricto", url });
      share.succeed();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        share.reset();
        return;
      }
      throw error;
    }
  }

  return (
    <div className="space-y-4">
      <Reveal>
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="live" icon={QrIcon}>
              QR
            </Badge>
            <Badge icon={Smartphone}>Cualquier dispositivo</Badge>
          </div>
          <h1 className="font-display text-3xl leading-tight">
            Llévala a <span className="text-gradient-copper">otro dispositivo</span>
          </h1>
          <p className="text-sm leading-relaxed text-stone">
            Este código abre ScannerStock en cualquier teléfono, tablet u ordenador con cámara. No hace falta cuenta ni
            instalar nada: el enlace abre la app en el navegador. Si quieres, después se añade a la pantalla de inicio.
          </p>
        </header>
      </Reveal>

      {url && code ? (
        <>
          <Reveal delay={60}>
            <SpotlightCard className="space-y-4 p-4" interactive={false}>
              <div className="qr-card">
                <QrCode value={url} ecc={ECC} className="qr-image" label={`Código QR de ${url}`} />
              </div>

              <div className="space-y-1 text-center">
                <p className="text-[11px] tracking-wide text-stone">
                  Corrección {ECC} · versión {code.version} · {code.size}×{code.size} módulos
                </p>
                <p className="stat-value break-all font-mono text-xs text-ivory/90">{url}</p>
              </div>

              <ActionButton
                label="Descargar PNG"
                busyLabel="Preparando…"
                successLabel="Guardado"
                errorLabel="No se pudo descargar"
                icon={Download}
                variant="primary"
                block
                controller={download}
                onAction={onDownload}
              />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ActionButton
                  label="Copiar enlace"
                  busyLabel="Copiando…"
                  successLabel="Copiado"
                  errorLabel="No se pudo copiar"
                  icon={Copy}
                  size="sm"
                  controller={copy}
                  onAction={() => copyText(url)}
                />
                {canShare ? (
                  <ActionButton
                    label="Compartir"
                    successLabel="Compartido"
                    icon={Share2}
                    size="sm"
                    controller={share}
                    onAction={onShareLink}
                  />
                ) : null}
                <ActionButton
                  label="Descargar SVG"
                  busyLabel="Preparando…"
                  successLabel="Guardado"
                  errorLabel="No se pudo descargar"
                  icon={Download}
                  size="sm"
                  controller={vector}
                  onAction={() =>
                    saveBlob(new Blob([qrSvgMarkup(code, { title: url })], { type: "image/svg+xml" }), `${QR_FILE_NAME}.svg`)
                  }
                />
              </div>

              <p className="text-center text-[11px] leading-relaxed text-stone">
                Si el navegador bloquea la descarga (pasa en algunas apps y previsualizaciones), mantén pulsado el código o
                haz clic derecho y guárdalo como imagen.
              </p>
            </SpotlightCard>
          </Reveal>

          <Reveal delay={120}>
            <section className="space-y-2">
              <h2 className="lane-header font-display text-xl">
                Instalarla, si apetece
                <span className="lane-hint">Se abre sin instalar</span>
              </h2>
              <ul className="space-y-2">
                {STEPS.map((step) => (
                  <li key={step.id} className="surface flex items-start gap-3 p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-copper/40 bg-copper/12 text-copper">
                      <step.icon size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="font-display text-lg leading-tight">{step.title}</p>
                      <p className="text-sm leading-relaxed text-ivory/90">{step.body}</p>
                      {step.tutorial ? (
                        <a className="inline-flex items-center gap-1.5 text-xs text-copper-soft" href="?install=1&platform=ios">
                          <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                          Ver los pasos con dibujos
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>

          <Reveal delay={180}>
            <SpotlightCard className="p-4 text-sm leading-relaxed text-stone" interactive={false}>
              <p className="flex items-start gap-2">
                <Landmark size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-copper" />
                <span>
                  El PNG es el que se pega en un cartel o se manda por mensajería; el SVG aguanta impresión en grande sin
                  pixelarse. El QR apunta a <span className="stat-value">{url}</span>, así que si cambia el dominio hay que
                  volver a descargarlo.
                </span>
              </p>
            </SpotlightCard>
          </Reveal>
        </>
      ) : (
        <Reveal delay={60}>
          <SpotlightCard className="p-4 text-sm leading-relaxed" interactive={false}>
            <p className="flex items-start gap-2 text-clay">
              <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                No se pudo resolver la dirección pública de esta copia. Abre la app con su dominio publicado y este QR
                apuntará ahí.
              </span>
            </p>
          </SpotlightCard>
        </Reveal>
      )}

      <Reveal delay={240}>
        <SpotlightCard className="p-4 text-sm leading-relaxed text-stone" interactive={false}>
          <p className="flex items-start gap-2">
            <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-pine" />
            <span>
              El código no lleva nada tuyo dentro: solo el enlace.{" "}
              <Link to="/privacidad" className="text-copper-soft">
                Lo que la app guarda
              </Link>{" "}
              sigue siendo lo mismo después de escanearlo.
            </span>
          </p>
        </SpotlightCard>
      </Reveal>
    </div>
  );
}
