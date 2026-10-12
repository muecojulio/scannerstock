import { useNavigate } from "@tanstack/react-router";
import * as Switch from "@radix-ui/react-switch";
import { useState } from "react";
import { computeMetrics, diagnose, emptySnapshot, parseOverrides, routeModel } from "@/lib/finance/diagnose";
import type { MetricOverrides, ModelId } from "@/lib/finance/types";
import { scanTicker, searchCompanies, type ScanResult } from "@/lib/market.functions";
import { useDesk } from "@/lib/desk";

const PRESETS = ["AAPL", "MSFT", "JPM", "NEE", "O", "KO"];

const MODELS: Array<{ id: ModelId | 0; label: string }> = [
  { id: 0, label: "Automático" },
  { id: 1, label: "Regulares" },
  { id: 2, label: "Bancos" },
  { id: 3, label: "Utilities" },
  { id: 4, label: "REITs" },
];

const FIELDS: Record<ModelId, Array<{ key: keyof MetricOverrides; label: string }>> = {
  1: [
    { key: "revenueGrowth", label: "Crecimiento de ingresos %" },
    { key: "grossMargin", label: "Margen bruto %" },
    { key: "roic", label: "ROIC %" },
    { key: "netDebtToEbitda", label: "Deuda neta / EBITDA" },
    { key: "currentRatio", label: "Liquidez" },
    { key: "fcf", label: "FCF (US$)" },
    { key: "fcfPrior", label: "FCF previo (US$)" },
  ],
  2: [
    { key: "efficiency", label: "Eficiencia %" },
    { key: "roe", label: "ROE %" },
    { key: "cet1", label: "CET1 %" },
    { key: "npl", label: "Morosidad %" },
    { key: "nplCoverage", label: "Cobertura %" },
    { key: "nim", label: "NIM %" },
  ],
  3: [
    { key: "operatingMargin", label: "Margen operativo %" },
    { key: "operatingMarginPrior", label: "Margen operativo previo %" },
    { key: "netDebtToEbitda", label: "Deuda neta / EBITDA" },
    { key: "interestCoverage", label: "Cobertura de intereses" },
    { key: "operatingCashFlow", label: "Flujo operativo (US$)" },
    { key: "capex", label: "CapEx (US$)" },
  ],
  4: [
    { key: "occupancy", label: "Ocupación %" },
    { key: "ffo", label: "FFO (US$)" },
    { key: "ffoPrior", label: "FFO previo (US$)" },
    { key: "debtToAssets", label: "Deuda / activos %" },
    { key: "affoPayout", label: "Payout AFFO %" },
    { key: "ffoMargin", label: "Margen FFO %" },
  ],
};

export function ScanDesk() {
  const navigate = useNavigate();
  const setResult = useDesk((state) => state.setResult);
  const [ticker, setTicker] = useState("AAPL");
  const [sector, setSector] = useState("");
  const [model, setModel] = useState<ModelId | 0>(0);
  const [own, setOwn] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [hints, setHints] = useState<Array<{ ticker: string; title: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeModel: ModelId = model === 0 ? 1 : model;

  function overrides(): MetricOverrides {
    const fromFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value.trim() !== "") fromFields[key] = value.trim();
    }
    const parsed = parseOverrides(fromFields);
    if (jsonMode && jsonText.trim()) {
      try {
        return { ...parsed, ...parseOverrides(JSON.parse(jsonText) as unknown) };
      } catch {
        throw new Error("El JSON no se pudo leer. Revisa comas y llaves.");
      }
    }
    return parsed;
  }

  async function onType(value: string) {
    setTicker(value.toUpperCase());
    if (value.trim().length < 1) {
      setHints([]);
      return;
    }
    try {
      const rows = await searchCompanies({ data: { q: value.trim() } });
      setHints(rows);
    } catch {
      setHints([]);
    }
  }

  function publish(result: ScanResult) {
    setResult(result);
    void navigate({ to: "/informe" });
  }

  async function scan(manualOnly: boolean) {
    setError("");
    setBusy(true);
    try {
      const custom = own || manualOnly ? overrides() : {};
      const runManual = () => {
        if (Object.keys(custom).length === 0) {
          throw new Error("Captura al menos una cifra para diagnosticar sin la SEC.");
        }
        const name = ticker.trim() || "Empresa";
        const routed = routeModel({
          sectorText: sector,
          sic: null,
          sicDescription: "",
          name,
          forced: model === 0 ? null : model,
        });
        const report = diagnose({
          model: routed.model,
          metrics: computeMetrics(emptySnapshot(), custom),
          company: name,
        });
        publish({
          found: true,
          ticker: ticker.trim().toUpperCase() || "MANUAL",
          company: name,
          sic: null,
          sicDescription: "",
          price: null,
          currency: null,
          fetchedAt: new Date().toISOString(),
          fromCache: false,
          routeReason: "Cifras capturadas en el teléfono. No se consultó la SEC.",
          sourceNote: "Sin consulta externa.",
          series: [],
          report,
        });
      };
      if (manualOnly) {
        runManual();
        return;
      }
      const result = await scanTicker({
        data: {
          ticker,
          sector,
          model: model === 0 ? null : model,
          overrides: custom,
        },
      });
      publish(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo completar el escaneo.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rise rounded-[var(--radius-card)] border border-line bg-panel p-4">
        <label className="text-xs tracking-wide text-stone" htmlFor="ticker">
          Empresa o ticker
        </label>
        <input
          id="ticker"
          value={ticker}
          onChange={(event) => void onType(event.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          className="mt-2 w-full rounded-2xl border border-line bg-ink px-4 py-3 font-display text-3xl tracking-tight text-ivory outline-none transition-colors focus:border-copper"
          placeholder="AAPL"
        />
        {hints.length > 0 && (
          <ul className="mt-2 overflow-hidden rounded-2xl border border-line">
            {hints.map((hint) => (
              <li key={hint.ticker}>
                <button
                  type="button"
                  className="press press-active flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-panel-2"
                  onClick={() => {
                    setTicker(hint.ticker);
                    setHints([]);
                  }}
                >
                  <span className="font-medium">{hint.ticker}</span>
                  <span className="truncate text-xs text-stone">{hint.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="press press-active rounded-full border border-line px-3 py-2 text-xs text-stone hover:border-copper hover:text-ivory"
              onClick={() => {
                setTicker(preset);
                setHints([]);
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </section>

      <section className="rise rise-2 space-y-3">
        <p className="text-xs tracking-wide text-stone">Modelo</p>
        <div className="grid grid-cols-2 gap-2">
          {MODELS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setModel(item.id)}
              className={`press press-active min-h-11 rounded-2xl border px-3 text-sm ${
                model === item.id ? "border-copper bg-copper/15 text-ivory" : "border-line bg-panel text-stone"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          value={sector}
          onChange={(event) => setSector(event.target.value)}
          placeholder="Sector, si lo conoces (opcional)"
          className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm outline-none focus:border-copper"
        />
      </section>

      <section className="rise rise-3 rounded-[var(--radius-card)] border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm">Usar cifras propias</p>
            <p className="text-xs text-stone">Sustituyen el dato público solo en este informe.</p>
          </div>
          <Switch.Root
            checked={own}
            onCheckedChange={setOwn}
            className="press relative h-7 w-12 rounded-full border border-line bg-ink transition-colors data-[state=checked]:border-copper data-[state=checked]:bg-copper/30"
            aria-label="Usar cifras propias"
          >
            <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-stone transition-transform duration-200 data-[state=checked]:translate-x-6 data-[state=checked]:bg-ivory" />
          </Switch.Root>
        </div>
        {own && (
          <div className="mt-4 grid gap-3">
            {FIELDS[activeModel].map((field) => (
              <label key={field.key} className="block text-xs text-stone">
                {field.label}
                <input
                  inputMode="decimal"
                  value={fields[field.key] ?? ""}
                  onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-3 text-base text-ivory outline-none focus:border-copper"
                />
              </label>
            ))}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-stone">Pegar JSON de métricas</span>
              <Switch.Root
                checked={jsonMode}
                onCheckedChange={setJsonMode}
                className="press relative h-7 w-12 rounded-full border border-line bg-ink data-[state=checked]:border-copper data-[state=checked]:bg-copper/30"
                aria-label="Pegar JSON"
              >
                <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-stone transition-transform duration-200 data-[state=checked]:translate-x-6 data-[state=checked]:bg-ivory" />
              </Switch.Root>
            </div>
            {jsonMode && (
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={5}
                placeholder='{"margenBruto": 46, "roic": 28}'
                className="w-full rounded-xl border border-line bg-ink p-3 font-mono text-xs outline-none focus:border-copper"
              />
            )}
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void scan(false)}
        className="press press-active relative h-14 w-full overflow-hidden rounded-2xl bg-copper text-base font-medium text-ink disabled:opacity-60"
      >
        {busy && <span className="scanline absolute inset-y-0 left-0 w-1/2 opacity-70" />}
        <span className="relative">{busy ? "Leyendo filings…" : "Generar diagnóstico"}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setOwn(true);
          void scan(true);
        }}
        className="press press-active h-12 w-full rounded-2xl border border-line text-sm text-stone"
      >
        Diagnosticar solo con mis cifras
      </button>
      <p className="text-center text-[11px] leading-relaxed text-stone">
        No es recomendación de inversión. Las reglas son las de tu modelo, sin suavizarlas.
      </p>
    </div>
  );
}
