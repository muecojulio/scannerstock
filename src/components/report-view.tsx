import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { money } from "@/lib/finance/diagnose";
import { reportToMarkdown } from "@/lib/finance/format";
import { useDesk } from "@/lib/desk";

const TONE: Record<string, string> = {
  BIEN: "text-pine border-pine/40 bg-pine/10",
  MAL: "text-clay border-clay/40 bg-clay/10",
  "ESTABLE/EN OBSERVACIÓN": "text-sand border-sand/40 bg-sand/10",
};

export function ReportView() {
  const result = useDesk((state) => state.result);
  const ready = useDesk((state) => state.ready);
  const hydrate = useDesk((state) => state.hydrate);
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    window.setTimeout(() => setCopied("idle"), 2000);
  }

  if (!ready) return <p className="text-sm text-stone">Abriendo el informe…</p>;

  if (!result) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
        <p className="font-display text-2xl">Aún no hay informe</p>
        <p className="mt-2 text-sm text-stone">Escanea un ticker para ver el diagnóstico con las reglas del modelo.</p>
        <Link to="/" className="press press-active mt-4 inline-flex min-h-11 items-center rounded-2xl bg-copper px-4 text-sm font-medium text-ink">
          Ir a escanear
        </Link>
      </div>
    );
  }

  const { report } = result;
  const max = Math.max(...result.series.map((point) => point.value), 1);

  return (
    <article className="space-y-4">
      <header className="rise">
        <p className="text-xs tracking-wide text-stone">{result.ticker}</p>
        <h1 className="font-display text-3xl leading-tight">{result.company}</h1>
        <p className="mt-2 text-sm text-stone">
          {result.price != null ? `${result.currency ?? "US$"} ${result.price.toLocaleString("es-MX")}` : "Precio no disponible"}
          {result.sicDescription ? ` · ${result.sicDescription}` : ""}
        </p>
      </header>

      <section className={`rise rise-2 rounded-[var(--radius-card)] border p-4 ${TONE[report.verdict] ?? TONE["ESTABLE/EN OBSERVACIÓN"]}`}>
        <p className="text-xs tracking-wide">Modelo detectado en automático</p>
        <p className="mt-1 font-display text-2xl leading-tight">{report.modelName}</p>
        <p className="mt-3 text-xs uppercase tracking-[0.14em]">Diagnóstico general</p>
        <p className="font-display text-3xl">{report.verdict}</p>
        <p className="mt-2 text-xs opacity-80">{result.routeReason}</p>
      </section>

      {result.series.length > 1 && (
        <section className="rounded-[var(--radius-card)] border border-line bg-panel p-4">
          <p className="text-xs text-stone">Ingresos anuales publicados</p>
          <div className="mt-3 flex h-28 items-end gap-2">
            {result.series.map((point) => (
              <div key={point.end} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-copper/80"
                  style={{ height: `${Math.max(8, (point.value / max) * 96)}px` }}
                />
                <span className="text-[10px] text-stone">{point.end.slice(0, 4)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Section title="Evaluación de salud financiera" items={[
        ["Rentabilidad del modelo", report.rentabilidad],
        ["Estructura de riesgo y apalancamiento", report.riesgo],
        ["Sostenibilidad del flujo de efectivo", report.flujo],
      ]} />

      <section className="space-y-3">
        <h2 className="font-display text-xl">Puntos fuertes y alertas rojas</h2>
        <List title="Puntos fuertes (pros)" items={report.pros} tone="text-pine" />
        <List title="Alertas rojas (contras / riesgos)" items={report.contras} tone="text-clay" />
      </section>

      <button
        type="button"
        onClick={() => copyReport(reportToMarkdown({ ticker: result.ticker, company: result.company, report }))}
        className="press press-active min-h-11 w-full rounded-2xl border border-line bg-panel px-4 text-sm font-medium text-ivory"
      >
        {copied === "ok" ? "Informe copiado" : copied === "error" ? "No se pudo copiar" : "Copiar informe en formato Markdown"}
      </button>

      <p className="text-[11px] leading-relaxed text-stone">
        Periodo base {report.metrics.period ?? "n/d"}. FCF {money(report.metrics.fcf)}. {result.sourceNote}{" "}
        {result.fromCache ? "Datos servidos desde la caché." : ""} {report.metrics.notes[0] ?? ""}
      </p>
    </article>
  );
}

function Section({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl">{title}</h2>
      {items.map(([label, body]) => (
        <div key={label} className="rounded-[var(--radius-card)] border border-line bg-panel p-4">
          <h3 className="text-sm text-copper">{label}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ivory/90">{body}</p>
        </div>
      ))}
    </section>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <section>
      <h3 className="text-sm text-copper">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm leading-relaxed">
            <span className={tone}>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
