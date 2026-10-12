import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Database, Gauge, Info, Landmark, Layers, Sparkles, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { ComboBox } from "@/components/ui/combobox";
import { Disclosure, SwitchField, TextField } from "@/components/ui/field";
import { ChipLane, QuickChips } from "@/components/ui/lane";
import { Reveal } from "@/components/ui/motion";
import { Badge, Meter } from "@/components/ui/status";
import { computeMetrics, diagnose, emptySnapshot, parseOverrides, routeModel } from "@/lib/finance/diagnose";
import type { MetricOverrides, ModelId } from "@/lib/finance/types";
import { scanTicker, searchCompanies, type ScanResult } from "@/lib/market.functions";
import { useDesk } from "@/lib/desk";
import { useActionStatus } from "@/lib/ui/hooks";

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

/**
 * Pantalla de escaneo.
 *
 * Conserva intacta la lógica de negocio (misma búsqueda, mismas reglas, mismo
 * `scanTicker`, mismas cifras propias); lo que cambia es el sistema de
 * interacción: campo con sugerencias navegable por teclado, modelos como
 * carril de chips, cifras propias en un panel plegable y un botón principal
 * con estados de cargando, éxito y error.
 */
export function ScanDesk() {
  const navigate = useNavigate();
  const setResult = useDesk((state) => state.setResult);
  const prefill = useDesk((state) => state.prefill);
  const setPrefill = useDesk((state) => state.setPrefill);
  const [ticker, setTicker] = useState("AAPL");
  const [sector, setSector] = useState("");
  const [model, setModel] = useState<ModelId | 0>(0);
  const [own, setOwn] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [hints, setHints] = useState<Array<{ ticker: string; title: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const status = useActionStatus();

  const activeModel: ModelId = model === 0 ? 1 : model;

  // Ticker pedido desde el historial ("reescanear"): se coloca y se limpia.
  useEffect(() => {
    if (!prefill) return;
    setTicker(prefill);
    setPrefill(null);
  }, [prefill, setPrefill]);

  const overrides = useCallback((): MetricOverrides => {
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
  }, [fields, jsonMode, jsonText]);

  async function onType(value: string) {
    setTicker(value.toUpperCase());
    if (value.trim().length < 1) {
      setHints([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchCompanies({ data: { q: value.trim() } });
      setHints(rows);
    } catch {
      setHints([]);
    } finally {
      setSearching(false);
    }
  }

  function publish(result: ScanResult) {
    setResult(result);
    void navigate({ to: "/informe" });
  }

  async function scan(manualOnly: boolean) {
    setError("");
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
          priceUsd: null,
          priceSource: "none",
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
      const outcome = await scanTicker({
        data: {
          ticker,
          sector,
          model: model === 0 ? null : model,
          overrides: custom,
        },
      });
      // El servidor devuelve el motivo en vez de lanzar: un throw cruzando el
      // server fn llega como 500 y el mensaje se pierde.
      if (!outcome.found) {
        setError(outcome.error);
        throw new Error(outcome.error);
      }
      publish(outcome);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo completar el escaneo.";
      setError(message);
      throw caught instanceof Error ? caught : new Error(message);
    }
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ portada */}
      <Reveal>
        <section className="surface spotlight overflow-hidden p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="live" pulse icon={Sparkles}>
              4 modelos
            </Badge>
            <Badge icon={Database}>SEC EDGAR</Badge>
            <Badge icon={Gauge}>Reglas fijas</Badge>
          </div>
          <h1 className="mt-3 font-display text-3xl leading-tight">
            Un solo modelo, <span className="text-gradient-copper">aplicado en serio</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone">
            Lee el filing anual público, detecta el modelo de negocio y aplica solo esas reglas. Sin cuentas, sin rastreadores y
            sin suavizar el veredicto.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Modelos", value: "4" },
              { label: "Caché", value: "12 h" },
              { label: "Coste", value: "$0" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-line-soft bg-panel-2/60 px-2 py-2.5">
                <dt className="text-[10px] tracking-[0.14em] text-stone uppercase">{stat.label}</dt>
                <dd className="stat-value font-display text-xl text-ivory">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Reveal>

      {/* ------------------------------------------------------------- ticker */}
      <Reveal delay={60}>
        <section className="surface space-y-3 p-4">
          <ComboBox
            id="ticker"
            label="Empresa o ticker"
            hint="Escribe para buscar en el padrón público de la SEC."
            value={ticker}
            loading={searching}
            autoCapitalize="characters"
            placeholder="AAPL"
            options={hints.map((hint) => ({ value: hint.ticker, label: hint.ticker, hint: hint.title }))}
            inputClassName="font-display text-3xl tracking-tight"
            onValueChange={(value) => void onType(value)}
            onSelect={(option) => {
              setTicker(option.value);
              setHints([]);
            }}
          />
          <div>
            <p className="field-label mb-1">Tickers frecuentes</p>
            <QuickChips
              label="Tickers frecuentes"
              current={ticker.trim().toUpperCase()}
              options={PRESETS.map((preset) => ({ value: preset, label: preset }))}
              onSelect={(value) => {
                setTicker(value);
                setHints([]);
              }}
            />
          </div>
        </section>
      </Reveal>

      {/* ------------------------------------------------------------ modelo */}
      <Reveal delay={120}>
        <section className="surface space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">Modelo de análisis</h2>
            <Badge icon={Layers}>{model === 0 ? "Automático" : "Forzado"}</Badge>
          </div>
          <ChipLane
            label="Modelo de análisis"
            value={String(model)}
            onValueChange={(value) => setModel(Number(value) as ModelId | 0)}
            options={MODELS.map((item) => ({
              value: String(item.id),
              label: item.label,
              icon: item.id === 0 ? Sparkles : item.id === 2 ? Landmark : undefined,
            }))}
          />
          <TextField
            label="Sector, si lo conoces (opcional)"
            hint="Ayuda a enrutar el modelo cuando la SEC no trae descripción."
            value={sector}
            onChange={(event) => setSector(event.target.value)}
            placeholder="Banca, eléctricas, REITs…"
          />
        </section>
      </Reveal>

      {/* ------------------------------------------------------ cifras propias */}
      <Reveal delay={180}>
        <Disclosure
          title="Usar cifras propias"
          summary="Sustituyen el dato público solo en este informe."
          icon={Info}
        >
          <SwitchField
            className="mb-3"
            label="Activar cifras propias"
            description="Sustituyen el dato público solo en este informe."
            checked={own}
            onCheckedChange={setOwn}
          />
          {own ? (
            <div className="space-y-3">
              <div className="grid gap-3">
                {FIELDS[activeModel].map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    inputMode="decimal"
                    value={fields[field.key] ?? ""}
                    onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                ))}
              </div>
              <SwitchField
                label="Pegar JSON de métricas"
                description='Admite un objeto como {"margenBruto": 46, "roic": 28}.'
                checked={jsonMode}
                onCheckedChange={setJsonMode}
              />
              {jsonMode ? (
                <label className="block">
                  <span className="field-label">JSON de métricas</span>
                  <textarea
                    value={jsonText}
                    onChange={(event) => setJsonText(event.target.value)}
                    rows={5}
                    placeholder='{"margenBruto": 46, "roic": 28}'
                    className="field mt-1.5 font-mono text-xs"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </Disclosure>
      </Reveal>

      {/* -------------------------------------------------------------- error */}
      {error ? (
        <div
          role="alert"
          className="shake flex items-start gap-3 rounded-2xl border border-clay/45 bg-clay/10 px-4 py-3 text-sm text-clay"
        >
          <TriangleAlert size={18} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">No se pudo completar el escaneo</p>
            <p className="text-clay/90">{error}</p>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- CTA */}
      <Reveal delay={240}>
        <div className="space-y-3">
          {status.busy ? (
            <div className="surface space-y-2 p-3.5">
              <p className="text-xs text-stone">Leyendo filings públicos de la SEC…</p>
              <Meter label="Progreso del escaneo" />
            </div>
          ) : null}
          <ActionButton
            variant="primary"
            block
            label="Generar diagnóstico"
            busyLabel="Leyendo filings…"
            successLabel="Diagnóstico listo"
            errorLabel="No se pudo escanear"
            controller={status}
            icon={Sparkles}
            /* El error ya se anuncia en el aviso de la pantalla. */
            announce={false}
            onAction={() => scan(false)}
          />
          <ActionButton
            variant="outline"
            block
            size="sm"
            label="Diagnosticar solo con mis cifras"
            onAction={() => {
              setOwn(true);
              return scan(true);
            }}
            onFailed={setError}
          />
          <p className="text-center text-[11px] leading-relaxed text-stone">
            No es recomendación de inversión. Las reglas son las de tu modelo, sin suavizarlas.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
