import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, History, RefreshCw, ScanSearch, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { ChipLane } from "@/components/ui/lane";
import { Reveal, SpotlightCard } from "@/components/ui/motion";
import { Badge, LiveRegion, Skeleton } from "@/components/ui/status";
import { SwipeRow } from "@/components/ui/swipe-row";
import { verdictShort, verdictTone, type VerdictTone } from "@/lib/finance/verdict";
import { listScans } from "@/lib/market.functions";
import { useDesk } from "@/lib/desk";

type Row = { ticker: string; model: number; verdict: string; scanned_at: string };

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "good", label: "Bien" },
  { value: "warn", label: "Observación" },
  { value: "bad", label: "Mal" },
] as const;

const TONE_ICON: Record<VerdictTone, typeof Check> = { good: Check, warn: History, bad: TriangleAlert };

/**
 * Historial público de lecturas.
 *
 * Las tarjetas se revelan con un gesto en el teléfono y, en escritorio, las
 * mismas acciones están siempre a la vista. El botón ⋯ abre y cierra el panel
 * sin gesto, así que las acciones nunca dependen del swipe.
 */
export function HistoryPanel() {
  const navigate = useNavigate();
  const setPrefill = useDesk((state) => state.setPrefill);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("todas");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let live = true;
    listScans()
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : "No se pudo leer el historial.");
      });
    return () => {
      live = false;
    };
  }, []);

  const counts = useMemo(() => {
    const base: Record<string, number> = { todas: rows?.length ?? 0, good: 0, warn: 0, bad: 0 };
    for (const row of rows ?? []) base[verdictTone(row.verdict)] = (base[verdictTone(row.verdict)] ?? 0) + 1;
    return base;
  }, [rows]);

  const visible = useMemo(
    () => (rows ?? []).filter((row) => filter === "todas" || verdictTone(row.verdict) === filter),
    [rows, filter],
  );

  async function copyTicker(ticker: string) {
    try {
      await navigator.clipboard.writeText(ticker);
      setCopied(ticker);
      setNotice(`Ticker ${ticker} copiado`);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setNotice(`No se pudo copiar ${ticker}`);
      throw new Error("El navegador no dio permiso para copiar al portapapeles.");
    }
  }

  function rescan(ticker: string) {
    setPrefill(ticker);
    setNotice(`Ticker ${ticker} listo para reescanear`);
    void navigate({ to: "/" });
  }

  if (error) {
    return (
      <SpotlightCard className="p-5" interactive={false}>
        <Badge tone="bad" icon={TriangleAlert}>
          Error
        </Badge>
        <p className="mt-3 font-display text-xl">No se pudo leer el historial</p>
        <p className="mt-2 text-sm text-stone">{error}</p>
        <ActionButton
          className="mt-4"
          block
          label="Reintentar"
          busyLabel="Leyendo…"
          variant="outline"
          onAction={async () => {
            const data = await listScans();
            setRows(data);
            setError("");
          }}
          onFailed={setError}
        />
      </SpotlightCard>
    );
  }

  if (!rows) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SpotlightCard className="space-y-3 p-4" interactive={false}>
          <Skeleton className="h-4 w-32" />
          <Skeleton lines={2} />
        </SpotlightCard>
        {[0, 1, 2].map((index) => (
          <SpotlightCard key={index} className="flex items-center justify-between gap-3 p-4" interactive={false}>
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </SpotlightCard>
        ))}
        <p className="text-center text-xs text-stone">Cargando lecturas públicas…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <SpotlightCard className="p-5">
        <Badge icon={ScanSearch}>Sin lecturas</Badge>
        <p className="mt-3 font-display text-2xl">Sin lecturas todavía</p>
        <p className="mt-2 text-sm leading-relaxed text-stone">
          Cada escaneo de un ticker de la SEC deja aquí el ticker, el modelo y el veredicto. Nada más.
        </p>
        <ActionButton className="mt-4" block variant="primary" label="Escanear el primero" onAction={() => void navigate({ to: "/" })} />
      </SpotlightCard>
    );
  }

  const total = rows.length;

  return (
    <div className="space-y-4">
      <Reveal>
        <SpotlightCard className="p-4" interactive={false}>
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl">Historial público</h1>
            <span className="stat-value text-xs text-stone">{total} lecturas</span>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full" role="img" aria-label={distributionLabel(counts, total)}>
            {(["good", "warn", "bad"] as const).map((tone) => (
              <span
                key={tone}
                className={
                  tone === "good" ? "bg-pine" : tone === "warn" ? "bg-sand" : "bg-clay"
                }
                style={{ width: `${total === 0 ? 0 : (counts[tone] / total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone">
            {(["good", "warn", "bad"] as const).map((tone) => (
              <li key={tone} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${tone === "good" ? "bg-pine" : tone === "warn" ? "bg-sand" : "bg-clay"}`}
                />
                {tone === "good" ? "Bien" : tone === "warn" ? "En observación" : "Mal"}: <span className="stat-value">{counts[tone]}</span>
              </li>
            ))}
          </ul>
        </SpotlightCard>
      </Reveal>

      <Reveal delay={60}>
        <ChipLane
          label="Filtros del historial"
          value={filter}
          onValueChange={setFilter}
          options={FILTERS.map((item) => ({
            value: item.value,
            label: item.label,
            hint: String(counts[item.value] ?? 0),
          }))}
        />
      </Reveal>

      {visible.length === 0 ? (
        <SpotlightCard className="p-4 text-sm text-stone" interactive={false}>
          Ninguna lectura coincide con este filtro.
        </SpotlightCard>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((row, index) => {
            const tone = verdictTone(row.verdict);
            const Icon = TONE_ICON[tone];
            return (
              <li key={`${row.ticker}-${row.scanned_at}-${index}`}>
                <Reveal delay={Math.min(index * 40, 240)}>
                  <SwipeRow
                    label={row.ticker}
                    className="surface"
                    actions={[
                      {
                        id: "rescan",
                        label: copied === row.ticker ? "Listo" : "Reescanear",
                        icon: RefreshCw,
                        tone: "scan",
                        onSelect: () => rescan(row.ticker),
                      },
                      {
                        id: "copy",
                        label: "Copiar",
                        icon: Copy,
                        tone: "copy",
                        onSelect: () => void copyTicker(row.ticker),
                      },
                    ]}
                  >
                    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg leading-tight">{row.ticker}</p>
                        <p className="mt-0.5 text-xs text-stone">
                          Modelo {row.model} · {formatWhen(row.scanned_at)}
                        </p>
                      </div>
                      <Badge tone={tone} icon={Icon}>
                        {verdictShort(row.verdict)}
                      </Badge>
                    </div>
                  </SwipeRow>
                </Reveal>
              </li>
            );
          })}
        </ul>
      )}

      <LiveRegion message={notice} />
    </div>
  );
}

function distributionLabel(counts: Record<string, number>, total: number): string {
  if (total === 0) return "Sin lecturas";
  return `${counts.good} bien, ${counts.warn} en observación, ${counts.bad} mal, de ${total} lecturas`;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
