import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { QrPanel } from "@/components/qr-panel";
import { getPublicOrigin } from "@/lib/public-url.functions";

export const Route = createFileRoute("/qr")({
  /**
   * El origen público se resuelve en el servidor antes de pintar: así el QR ya
   * está en el HTML y no aparece un hueco que se rellena al hidratar.
   */
  loader: async () => ({ origin: await getPublicOrigin().catch(() => "") }),
  head: () => ({
    meta: [
      { title: "QR · ScannerStock" },
      {
        name: "description",
        content:
          "Código QR de ScannerStock para abrirla en cualquier dispositivo. Se descarga en PNG para compartir y en SVG para imprimir en grande.",
      },
    ],
  }),
  component: function Qr() {
    const { origin } = Route.useLoaderData();
    return (
      <AppFrame>
        <QrPanel origin={origin} />
      </AppFrame>
    );
  },
});
