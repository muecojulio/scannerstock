import { useState, type ComponentType } from "react";
import { BookOpen, Building2, Check, Home, Landmark, TriangleAlert, Zap } from "lucide-react";
import { Reveal, SpotlightCard } from "@/components/ui/motion";
import { Badge } from "@/components/ui/status";
import { Tabs, type TabItem } from "@/components/ui/tabs";

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

type Model = {
  id: string;
  tab: string;
  name: string;
  when: string;
  good: string;
  bad: string;
  icon: IconComponent;
};

const MODELS: Model[] = [
  {
    id: "1",
    tab: "Regulares",
    name: "Modelo 1 · Regulares",
    when: "Tecnología, consumo, salud, industria.",
    good: "Ingresos estables o al alza, margen bruto > 40%, ROIC > 15%, deuda/EBITDA < 2.5x, liquidez > 1.2 y FCF positivo.",
    bad: "FCF negativo dos ejercicios, deuda/EBITDA > 4.5x o liquidez < 1.0.",
    icon: Building2,
  },
  {
    id: "2",
    tab: "Bancos",
    name: "Modelo 2 · Bancos",
    when: "Banca comercial, de inversión o servicios financieros tradicionales.",
    good: "Eficiencia < 55%, ROE > 12%, CET1 > 11.5%, morosidad < 3% y cobertura > 100%.",
    bad: "CET1 < 10.5%, eficiencia > 65% o morosidad alta sin cobertura.",
    icon: Landmark,
  },
  {
    id: "3",
    tab: "Utilities",
    name: "Modelo 3 · Utilities y energía",
    when: "Electricidad, agua, gas e infraestructura regulada.",
    good: "Margen operativo estable, deuda/EBITDA hasta 4.5x, cobertura de intereses > 3x y flujo operativo que cubre el CapEx.",
    bad: "Deuda/EBITDA > 6x, cobertura de intereses < 1.5x o flujo que no cubre el CapEx.",
    icon: Zap,
  },
  {
    id: "4",
    tab: "REITs",
    name: "Modelo 4 · REITs",
    when: "Fideicomisos y empresas de alquiler inmobiliario.",
    good: "Ocupación > 90%, FFO creciente, deuda/activos < 50% y payout del AFFO < 90%.",
    bad: "Ocupación < 80%, FFO en caída, deuda/activos > 70% o dividendo por encima del AFFO.",
    icon: Home,
  },
];

const TABS: TabItem[] = MODELS.map((model) => ({ id: model.id, label: model.tab, icon: model.icon }));

/** Separa los criterios por comas. Solo presentación: el texto no cambia. */
function splitCriteria(text: string): string[] {
  return text
    .replace(/\.$/, "")
    .split(", ")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Método: qué mide cada modelo y con qué reglas.
 *
 * Cada modelo es una pestaña con semántica accesible, recorrido con flechas e
 * Inicio/Fin, indicador que se desliza y cambio de panel por gesto horizontal
 * en el teléfono. Las reglas se leen como lista, no como párrafo: son umbrales.
 */
export function MethodPanel() {
  const [tab, setTab] = useState(MODELS[0]?.id ?? "1");

  return (
    <div className="space-y-4">
      <Reveal>
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="live" icon={BookOpen}>
              4 modelos
            </Badge>
            <Badge>Reglas fijas</Badge>
          </div>
          <h1 className="font-display text-3xl leading-tight">
            Un solo modelo <span className="text-gradient-copper">a la vez</span>
          </h1>
          <p className="text-sm leading-relaxed text-stone">
            ScannerStock lee el sector y aplica exclusivamente sus reglas. No promedia bancos con fábricas. Los números salen de
            los filings anuales de la SEC. Si una cifra no está, el veredicto no la inventa.
          </p>
        </header>
      </Reveal>

      <Reveal delay={60}>
        <Tabs
          items={TABS}
          value={tab}
          onValueChange={setTab}
          label="Modelos de análisis"
          panels={Object.fromEntries(
            MODELS.map((model) => [
              model.id,
              <div key={model.id} className="space-y-3 pt-1">
                <SpotlightCard className="p-4" interactive={false}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-copper/40 bg-copper/12 text-copper">
                      <model.icon size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-xl leading-tight">{model.name}</h2>
                      <p className="mt-1 text-sm text-stone">{model.when}</p>
                    </div>
                  </div>
                </SpotlightCard>

                <SpotlightCard className="p-4" interactive={false}>
                  <h3 className="flex items-center gap-2 text-sm text-pine">
                    <Check size={15} strokeWidth={2} aria-hidden="true" />
                    Se considera bien
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {splitCriteria(model.good).map((criterion) => (
                      <li key={criterion} className="flex items-start gap-2 text-sm leading-relaxed text-ivory/90">
                        <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pine" />
                        {criterion}
                      </li>
                    ))}
                  </ul>
                </SpotlightCard>

                <SpotlightCard className="p-4" interactive={false}>
                  <h3 className="flex items-center gap-2 text-sm text-clay">
                    <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
                    Señales de alerta
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {splitCriteria(model.bad).map((criterion) => (
                      <li key={criterion} className="flex items-start gap-2 text-sm leading-relaxed text-ivory/90">
                        <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-clay" />
                        {criterion}
                      </li>
                    ))}
                  </ul>
                </SpotlightCard>
              </div>,
            ]),
          )}
        />
      </Reveal>

      <Reveal delay={120}>
        <SpotlightCard className="p-4 text-sm leading-relaxed text-stone" interactive={false}>
          Lo que no entra: ni Hugging Face, ni Zapier, ni rastreadores de páginas. El diagnóstico es una regla fija en la
          aplicación. El precio de referencia, si aparece, viene de una consulta pública del ticker y no altera el veredicto.{" "}
          <span className="text-stone/90">
            FFO y AFFO de los REITs son aproximaciones contables (utilidad más depreciación, menos CapEx) porque el XBRL no trae
            siempre el FFO de la empresa.
          </span>
        </SpotlightCard>
      </Reveal>
    </div>
  );
}
