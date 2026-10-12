import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  Check,
  ClipboardCheck,
  Copy,
  Database,
  Landmark,
  Layers,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Lane } from "@/components/ui/lane";
import { Reveal, SpotlightCard } from "@/components/ui/motion";
import { Badge } from "@/components/ui/status";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { money } from "@/lib/finance/diagnose";
import { reportToMarkdown } from "@/lib/finance/format";
import type { Report } from "@/lib/finance/types";
import { useDesk } from "@/lib/desk";

const TONE: Record<string, { box: string; badge: "good" | "bad" | "warn"; label: string }> = {
  BIEN: { box: "border-pine/45 bg-pine/10 text-pine", badge: "good", label: "Bien" },
  MAL: { box: "border-clay/45 bg-clay/10 text-clay", badge: "bad", label: "Mal" },
  "ESTABLE/EN OBSERVACIÓN": {
    box: "border-sand/45 bg-sand/10 text-sand",
    badge: "warn",
    label: "En observación",
  },
};

const SECTIONS: TabItem[] = [
  { id: "veredicto", label: "Veredicto", icon: ClipboardCheck },
  { id: "cifras", label: "Cifras", icon: TrendingUp },
  { id: "riesgos", label: "Riesgos", icon: ShieldAlert },
];

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
type Kpi = { label: string; value: string; hint?: string; icon: IconComponent };

/** Cifras que se comparan de un vistazo. Solo aparecen las que existen. */
function buildKpis(report: Report, price: string | null): Kpi[] {
  const m = report.metrics;
  const pct = (value: number | null, decimals = 1) =>
    value == null ? null : `${value.toLocaleString("es-MX", { maximumFractionDigits: decimals })} %`;
  const times = (value: number | null) =>
    value == null ? null : `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ×`;
  const candidate: Array<Kpi | null> = [
    price ? { label: "Precio de referencia", value: price, hint: "No entra en el veredicto", icon: Banknote } : null,
    pct(m.roic) ? { label: "ROIC", value: pct(m.roic) as string, icon: TrendingUp } : null,
    times(m.netDebtToEbitda)
      ? { label: "Deuda neta / EBITDA", value: times(m.netDebtToEbitda) as string, icon: Landmark }
      : null,
    pct(m.grossMargin) ? { label: "Margen bruto", value: pct(m.grossMargin) as string, icon: Activity } : null,
    times(m.currentRatio) ? { label: "Liquidez", value: times(m.currentRatio) as string, icon: Wallet } : null,
    m.fcf != null ? { label: "Flujo libre (FCF)", value: money(m.fcf), hint: "Último ejercicio", icon: Banknote } : null,
    pct(m.roe) ? { label: "ROE", value: pct(m.roe) as string, icon: TrendingUp } : null,
    pct(m.cet1) ? { label: "CET1", value: pct(m.cet1) as string, icon: ShieldAlert } : null,
    pct(m.efficiency) ? { label: "Eficiencia", value: pct(m.efficiency) as string, icon: Database } : null,
    pct(m.occupancy) ? { label: "Ocupación", value: pct(m.occupancy) as string, icon: Layers } : null,
  ];
  return candidate.filter((item): item is Kpi => item !== null).slice(0, 6);
}

export function ReportView() {
  const result = useDesk((state) => state.result);
  const ready = useDesk((state) => state.ready);
  const hydrate = useDesk((state) => state.hydrate);
  const [tab, setTab] = useState("veredicto");
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const report = result?.report;

  const kpis = useMemo(
    () =>
      report
        ? buildKpis(
            report,
            result?.price != null
              ? `${result.currency ?? "US$"} ${result.price.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`
              : null,
          )
        : [],
    [report, result?.currency, result?.price],
  );

  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("error");
      throw new Error("El navegador no dio permiso para copiar al portapapeles.");
    }
  }

  if (!ready) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="text-sm text-stone">Abriendo el informe…</p>
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  if (!result || !report) {
    return (
      <SpotlightCard className="p-5">
        <Badge icon={ClipboardCheck}>Sin lectura</Badge>
        <p className="mt-3 font-display text-2xl">Aún no hay informe</p>
        <p className="mt-2 text-sm text-stone">
          Escanea un ticker para ver el diagnóstico con las reglas del modelo.
        </p>
        <Link to="/" className="btn btn-primary btn-block mt-4">
          Ir a escanear
        </Link>
      </SpotlightCard>
    );
  }

  const tone = TONE[report.verdict] ?? TONE["ESTABLE/EN OBSERVACIÓN"];
  const max = Math.max(...result.series.map((point) => point.value), 1);
  const growth =
    result.series.length > 1
      ? ((result.series[result.series.length - 1]?.value ?? 0) - (result.series[result.series.length - 2]?.value ?? 0)) /
        Math.abs(result.series[result.series.length - 2]?.value ?? 1)
      : null;

  return (
    <article className="space-y-5">
      <Reveal>
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="live">{result.ticker}</Badge>
            <Badge icon={Layers}>{report.modelName}</Badge>
            {result.fromCache ? <Badge tone="warn">Copia en caché</Badge> : null}
          </div>
          <h1 className="font-display text-3xl leading-tight">{result.company}</h1>
          <p className="text-sm text-stone">
            {result.sicDescription ? `${result.sicDescription} · ` : ""}
            {result.price != null
              ? `${result.currency ?? "US$"} ${result.price.toLocaleString("es-MX")}`
              : "Precio no disponible"}
            {result.priceUsd != null && result.priceUsd !== result.price
              ? ` · ≈ US$ ${result.priceUsd.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`
              : ""}
          </p>
        </header>
      </Reveal>

      {/* ------------------------------------------------------ tarjeta veredicto */}
      <Reveal delay={60}>
        <section className={`spotlight relative overflow-hidden rounded-[var(--radius-card)] border p-5 ${tone.box}`}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-current opacity-20 blur-2xl motion-safe:animate-[breathe_4.5s_ease-in-out_infinite]"
          />
          <div className="relative">
            <Badge tone={tone.badge} icon={tone.badge === "good" ? Check : tone.badge === "bad" ? TriangleAlert : Activity}>
              Diagnóstico general
            </Badge>
            <p className="mt-3 font-display text-4xl leading-none">{report.verdict}</p>
            <p className="mt-2 text-sm opacity-90">{report.modelName}</p>
            <p className="mt-3 text-xs leading-relaxed opacity-80">{result.routeReason}</p>
          </div>
        </section>
      </Reveal>

      {/* ------------------------------------------------------------- cifras KPI */}
      {kpis.length > 0 ? (
        <Reveal delay={120}>
          <Lane
            label="Cifras de un vistazo"
            items={kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <SpotlightCard className="h-full p-3.5">
                  <span className="flex items-center gap-2 text-[11px] tracking-wide text-stone uppercase">
                    <Icon size={13} strokeWidth={2} aria-hidden="true" />
                    {kpi.label}
                  </span>
                  <p className="stat-value mt-2 font-display text-2xl text-ivory">{kpi.value}</p>
                  {kpi.hint ? <p className="mt-1 text-[11px] text-stone">{kpi.hint}</p> : null}
                </SpotlightCard>
              );
            })}
          />
        </Reveal>
      ) : null}

      {/* -------------------------------------------------------------- pestañas */}
      <Reveal delay={180}>
        <Tabs
          items={SECTIONS}
          value={tab}
          onValueChange={setTab}
          label="Secciones del informe"
          panels={{
            veredicto: (
              <div className="space-y-3 pt-1">
                {(
                  [
                    ["Rentabilidad del modelo", report.rentabilidad, TrendingUp],
                    ["Estructura de riesgo y apalancamiento", report.riesgo, ShieldAlert],
                    ["Sostenibilidad del flujo de efectivo", report.flujo, Wallet],
                  ] as const
                ).map(([title, body, Icon]) => (
                  <SpotlightCard key={title} className="p-4">
                    <h3 className="flex items-center gap-2 text-sm text-copper">
                      <Icon size={15} strokeWidth={2} aria-hidden="true" />
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ivory/90">{body}</p>
                  </SpotlightCard>
                ))}
              </div>
            ),
            cifras: (
              <div className="space-y-3 pt-1">
                {result.series.length > 1 ? (
                  <SpotlightCard className="p-4" interactive={false}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs text-stone">Ingresos anuales publicados</p>
                      {growth != null ? (
                        <Badge tone={growth >= 0 ? "good" : "bad"} icon={ArrowUpRight}>
                          {(growth * 100).toLocaleString("es-MX", { maximumFractionDigits: 1 })} %
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-4 flex h-28 items-end gap-2">
                      {result.series.map((point, index) => (
                        <div key={point.end} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                          <span className="stat-value text-[10px] text-stone">
                            {point.value >= 1e9
                              ? `${(point.value / 1e9).toLocaleString("es-MX", { maximumFractionDigits: 0 })} mM`
                              : money(point.value).replace("US$ ", "")}
                          </span>
                          <span
                            className="w-full origin-bottom rounded-t-md bg-gradient-to-t from-copper/50 to-copper-soft"
                            style={{
                              height: `${Math.max(8, (point.value / max) * 88)}px`,
                              animation: `grow 620ms var(--ease-smooth) both`,
                              animationDelay: `${index * 70}ms`,
                            }}
                          />
                          <span className="text-[10px] text-stone">{point.end.slice(0, 4)}</span>
                        </div>
                      ))}
                    </div>
                  </SpotlightCard>
                ) : null}

                <SpotlightCard className="p-4" interactive={false}>
                  <p className="text-xs text-stone">Métricas calculadas del filing</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {metricRows(report).map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-2 border-b border-line-soft pb-1.5">
                        <dt className="text-xs text-stone">{label}</dt>
                        <dd className="stat-value text-ivory">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[11px] leading-relaxed text-stone">
                    Periodo base {report.metrics.period ?? "n/d"}. {result.sourceNote}{" "}
                    {result.fromCache ? "Datos servidos desde la caché." : ""}
                  </p>
                </SpotlightCard>
              </div>
            ),
            riesgos: (
              <div className="space-y-4 pt-1">
                <MetricList title="Puntos fuertes" items={report.pros} tone="good" icon={Check} />
                <MetricList title="Alertas rojas" items={report.contras} tone="bad" icon={TriangleAlert} />
                {report.metrics.notes.length > 0 ? (
                  <SpotlightCard className="p-4" interactive={false}>
                    <p className="text-xs text-copper">Notas de cálculo</p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-stone">
                      {report.metrics.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-stone" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </SpotlightCard>
                ) : null}
              </div>
            ),
          }}
        />
      </Reveal>

      <ActionButton
        block
        label="Copiar informe en Markdown"
        busyLabel="Copiando…"
        successLabel="Informe copiado"
        errorLabel={
          copied === "error" ? "No se pudo copiar · toca para reintentar" : "No se pudo copiar"
        }
        variant="outline"
        icon={Copy}
        onAction={() => copyReport(reportToMarkdown({ ticker: result.ticker, company: result.company, report }))}
      />

      <p className="text-[11px] leading-relaxed text-stone">
        FCF {money(report.metrics.fcf)}. El precio es contexto y no entra en el veredicto.{" "}
        {report.metrics.notes[0] ?? ""}
      </p>
    </article>
  );
}

function MetricList({
  title,
  items,
  tone,
  icon: Icon,
}: {
  title: string;
  items: string[];
  tone: "good" | "bad";
  icon: typeof Check;
}) {
  const accent = tone === "good" ? "text-pine" : "text-clay";
  return (
    <section>
      <h3 className={`flex items-center gap-2 text-sm ${accent}`}>
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        {title}
      </h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="surface flex items-start gap-2.5 px-3.5 py-3 text-sm leading-relaxed">
            <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone === "good" ? "bg-pine" : "bg-clay"}`} />
            <span className="text-ivory/90">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Filas de métricas presentes, ya formateadas. */
function metricRows(report: Report): Array<[string, string]> {
  const m = report.metrics;
  const pct = (value: number | null) =>
    value == null ? null : `${value.toLocaleString("es-MX", { maximumFractionDigits: 1 })} %`;
  const times = (value: number | null) =>
    value == null ? null : `${value.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ×`;
  const rows: Array<[string, string | null]> = [
    ["Periodo", m.period],
    ["Crecimiento de ingresos", pct(m.revenueGrowth)],
    ["Margen bruto", pct(m.grossMargin)],
    ["Margen operativo", pct(m.operatingMargin)],
    ["Margen neto", pct(m.netMargin)],
    ["ROIC", pct(m.roic)],
    ["ROE", pct(m.roe)],
    ["Deuda neta / EBITDA", times(m.netDebtToEbitda)],
    ["Cobertura de intereses", times(m.interestCoverage)],
    ["Liquidez", times(m.currentRatio)],
    ["Eficiencia", pct(m.efficiency)],
    ["CET1", pct(m.cet1)],
    ["Morosidad", pct(m.npl)],
    ["Cobertura de mora", pct(m.nplCoverage)],
    ["NIM", pct(m.nim)],
    ["Ocupación", pct(m.occupancy)],
    ["Payout AFFO", pct(m.affoPayout)],
    ["Deuda / activos", pct(m.debtToAssets)],
    ["Margen FFO", pct(m.ffoMargin)],
    ["Flujo libre (FCF)", m.fcf == null ? null : money(m.fcf)],
    ["EBITDA", m.ebitda == null ? null : money(m.ebitda)],
    ["Deuda neta", m.netDebt == null ? null : money(m.netDebt)],
  ];
  return rows.filter((row): row is [string, string] => row[1] != null);
}
