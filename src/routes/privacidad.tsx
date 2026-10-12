import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";

export const Route = createFileRoute("/privacidad")({
  component: function Privacidad() {
    return (
      <AppFrame>
        <article className="space-y-4 text-sm leading-relaxed">
          <h1 className="font-display text-3xl">Privacidad</h1>
          <p>
            ScannerStock consulta datos públicos de emisoras que reportan a la SEC de Estados Unidos y, si está
            disponible, el precio de mercado de ese mismo ticker. No pide cuenta, no vende datos y no envía tus cifras
            a modelos de inteligencia artificial ni a automatizaciones externas.
          </p>
          <p>
            La base compartida guarda solo el ticker, el nombre público, el código de industria, las series contables
            ya resumidas, el precio y el veredicto. No guarda notas personales ni el JSON que pegues. Esas cifras viven
            únicamente en este teléfono, en el último informe.
          </p>
          <p>
            Hay un índice por ticker y por fecha para no repetir descargas. La copia pública caduca a las 12 horas.
            El historial visible conserva como máximo las últimas 400 lecturas de tickers, sin identificar a quién escaneó.
          </p>
          <p>
            Esto no es asesoría de inversión. Los umbrales son reglas estrictas: una sola métrica en zona de alerta
            puede marcar MAL aunque el resto se vea sano.
          </p>
          <Link to="/" className="press press-active inline-flex min-h-11 items-center text-copper">
            Volver a escanear
          </Link>
        </article>
      </AppFrame>
    );
  },
});
