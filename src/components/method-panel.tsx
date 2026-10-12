const models = [
  {
    name: "Modelo 1 · Regulares",
    when: "Tecnología, consumo, salud, industria.",
    good: "Ingresos estables o al alza, margen bruto > 40%, ROIC > 15%, deuda/EBITDA < 2.5x, liquidez > 1.2 y FCF positivo.",
    bad: "FCF negativo dos ejercicios, deuda/EBITDA > 4.5x o liquidez < 1.0.",
  },
  {
    name: "Modelo 2 · Bancos",
    when: "Banca comercial, de inversión o servicios financieros tradicionales.",
    good: "Eficiencia < 55%, ROE > 12%, CET1 > 11.5%, morosidad < 3% y cobertura > 100%.",
    bad: "CET1 < 10.5%, eficiencia > 65% o morosidad alta sin cobertura.",
  },
  {
    name: "Modelo 3 · Utilities y energía",
    when: "Electricidad, agua, gas e infraestructura regulada.",
    good: "Margen operativo estable, deuda/EBITDA hasta 4.5x, cobertura de intereses > 3x y flujo operativo que cubre el CapEx.",
    bad: "Deuda/EBITDA > 6x, cobertura de intereses < 1.5x o flujo que no cubre el CapEx.",
  },
  {
    name: "Modelo 4 · REITs",
    when: "Fideicomisos y empresas de alquiler inmobiliario.",
    good: "Ocupación > 90%, FFO creciente, deuda/activos < 50% y payout del AFFO < 90%.",
    bad: "Ocupación < 80%, FFO en caída, deuda/activos > 70% o dividendo por encima del AFFO.",
  },
];

export function MethodPanel() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl leading-tight">Un solo modelo a la vez</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone">
          ScannerStock lee el sector y aplica exclusivamente sus reglas. No promedia bancos con fábricas.
          Los números salen de los filings anuales de la SEC. Si una cifra no está, el veredicto no la inventa.
        </p>
      </header>
      {models.map((model) => (
        <article key={model.name} className="rounded-[var(--radius-card)] border border-line bg-panel p-4">
          <h2 className="font-display text-xl">{model.name}</h2>
          <p className="mt-2 text-sm text-stone">{model.when}</p>
          <p className="mt-3 text-sm"><span className="text-pine">Bien. </span>{model.good}</p>
          <p className="mt-2 text-sm"><span className="text-clay">Mal. </span>{model.bad}</p>
        </article>
      ))}
      <article className="rounded-[var(--radius-card)] border border-line bg-panel p-4 text-sm leading-relaxed text-stone">
        Lo que no entra: ni Hugging Face, ni Zapier, ni rastreadores de páginas. El diagnóstico es una regla fija
        en la aplicación. El precio de referencia, si aparece, viene de una consulta pública del ticker y no altera el veredicto.
        FFO y AFFO de los REITs son aproximaciones contables (utilidad más depreciación, menos CapEx) porque el XBRL no trae siempre el FFO de la empresa.
      </article>
    </div>
  );
}
