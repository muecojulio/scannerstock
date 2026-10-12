import type {
  MetricOverrides,
  Metrics,
  ModelId,
  Point,
  Report,
  Snapshot,
  Verdict,
} from "./types";

const DAY = 86_400_000;

const MODEL_NAME: Record<ModelId, string> = {
  1: "Modelo 1 — Empresas regulares",
  2: "Modelo 2 — Bancos e instituciones financieras",
  3: "Modelo 3 — Utilities y energía",
  4: "Modelo 4 — REITs / inmobiliarias",
};

export function emptySnapshot(): Snapshot {
  return {
    revenue: [],
    grossProfit: [],
    costOfRevenue: [],
    netIncome: [],
    operatingIncome: [],
    pretax: [],
    tax: [],
    currentAssets: [],
    currentLiabilities: [],
    cash: [],
    equity: [],
    assets: [],
    operatingCashFlow: [],
    capex: [],
    depreciation: [],
    interestExpense: [],
    dividends: [],
    longDebtNoncurrent: [],
    longDebtCurrent: [],
    longDebt: [],
    commercialPaper: [],
    shortBorrowings: [],
    netInterestIncome: [],
    noninterestExpense: [],
    noninterestIncome: [],
    cet1: [],
    nonaccrual: [],
    allowance: [],
    loans: [],
  };
}

function near(series: Point[], end: string | null): number | null {
  if (!end || series.length === 0) return null;
  const target = Date.parse(end);
  if (!Number.isFinite(target)) return null;
  let best: Point | null = null;
  let diff = Infinity;
  for (const point of series) {
    const d = Math.abs(Date.parse(point.end) - target);
    if (d < diff) {
      diff = d;
      best = point;
    }
  }
  if (!best || diff > 45 * DAY) return null;
  return best.value;
}

function lastTwo(groups: Point[][]): [string | null, string | null] {
  const ends = new Set<string>();
  for (const series of groups) for (const point of series) ends.add(point.end);
  const sorted = [...ends].sort();
  if (sorted.length === 0) return [null, null];
  const last = sorted[sorted.length - 1] ?? null;
  if (!last) return [null, null];
  const lastT = Date.parse(last);
  let prior: string | null = null;
  for (let i = sorted.length - 2; i >= 0; i -= 1) {
    const candidate = sorted[i];
    if (candidate && lastT - Date.parse(candidate) > 200 * DAY) {
      prior = candidate;
      break;
    }
  }
  return [last, prior];
}

function debtAt(snapshot: Snapshot, end: string | null): number | null {
  const noncurrent = near(snapshot.longDebtNoncurrent, end);
  const current = near(snapshot.longDebtCurrent, end);
  const paper = near(snapshot.commercialPaper, end);
  const short = near(snapshot.shortBorrowings, end);
  const total = near(snapshot.longDebt, end);
  if (noncurrent == null && total == null && current == null && paper == null && short == null) return null;
  if (noncurrent != null) return noncurrent + (current ?? 0) + (paper ?? 0) + (short ?? 0);
  return (total ?? 0) + (paper ?? 0) + (short ?? 0);
}

function pct(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null;
  return (part / whole) * 100;
}

export function computeMetrics(snapshot: Snapshot, overrides: MetricOverrides = {}): Metrics {
  const notes: string[] = [];
  const [period, priorPeriod] = lastTwo([
    snapshot.revenue,
    snapshot.assets,
    snapshot.netIncome,
    snapshot.operatingIncome,
  ]);

  const revenue = near(snapshot.revenue, period);
  const revenuePrior = near(snapshot.revenue, priorPeriod);
  const gross = near(snapshot.grossProfit, period);
  const cost = near(snapshot.costOfRevenue, period);
  const netIncome = near(snapshot.netIncome, period);
  const op = near(snapshot.operatingIncome, period);
  const opPrior = near(snapshot.operatingIncome, priorPeriod);
  const revenueForPriorMargin = near(snapshot.revenue, priorPeriod);
  const pretax = near(snapshot.pretax, period);
  const tax = near(snapshot.tax, period);
  const currentAssets = near(snapshot.currentAssets, period);
  const currentLiabilities = near(snapshot.currentLiabilities, period);
  const cash = near(snapshot.cash, period);
  const equity = near(snapshot.equity, period);
  const equityPrior = near(snapshot.equity, priorPeriod);
  const assets = near(snapshot.assets, period);
  const assetsPrior = near(snapshot.assets, priorPeriod);
  const ocf = near(snapshot.operatingCashFlow, period);
  const ocfPrior = near(snapshot.operatingCashFlow, priorPeriod);
  const capexRaw = near(snapshot.capex, period);
  const capexPriorRaw = near(snapshot.capex, priorPeriod);
  const capex = capexRaw == null ? null : Math.abs(capexRaw);
  const capexPrior = capexPriorRaw == null ? null : Math.abs(capexPriorRaw);
  const da = near(snapshot.depreciation, period);
  const daPrior = near(snapshot.depreciation, priorPeriod);
  const interest = near(snapshot.interestExpense, period);
  const dividends = near(snapshot.dividends, period);
  const debt = debtAt(snapshot, period);
  const nii = near(snapshot.netInterestIncome, period);
  const nie = near(snapshot.noninterestExpense, period);
  const niiOther = near(snapshot.noninterestIncome, period);
  const cet1Raw = near(snapshot.cet1, period);
  const nonaccrual = near(snapshot.nonaccrual, period);
  const allowance = near(snapshot.allowance, period);
  const loans = near(snapshot.loans, period);

  const revenueGrowth =
    revenue != null && revenuePrior != null && revenuePrior !== 0
      ? ((revenue - revenuePrior) / Math.abs(revenuePrior)) * 100
      : null;

  const grossMargin =
    gross != null && revenue != null && revenue !== 0
      ? (gross / revenue) * 100
      : revenue != null && cost != null && revenue !== 0
        ? ((revenue - cost) / revenue) * 100
        : null;

  const operatingMargin = pct(op, revenue);
  const operatingMarginPrior = pct(opPrior, revenueForPriorMargin);
  const netMargin = pct(netIncome, revenue);

  let taxRate = 0.21;
  if (pretax != null && pretax > 0 && tax != null) {
    taxRate = Math.min(0.45, Math.max(0, tax / pretax));
  } else if (op != null) {
    notes.push("ROIC usa una tasa fiscal supuesta del 21% porque el desglose fiscal anual no vino completo.");
  }

  const ebitda = op != null && da != null ? op + Math.abs(da) : null;
  const netDebt = debt != null && cash != null ? debt - cash : debt;
  const invested = equity != null && debt != null && cash != null ? equity + debt - cash : null;
  const roic =
    op != null && invested != null && invested > 0 ? ((op * (1 - taxRate)) / invested) * 100 : null;
  if (invested != null && invested <= 0) {
    notes.push("Capital invertido no positivo: ROIC no se calcula.");
  }

  const equityBase =
    equity != null && equityPrior != null ? (equity + equityPrior) / 2 : equity;
  const roe = netIncome != null && equityBase != null && equityBase !== 0 ? (netIncome / equityBase) * 100 : null;
  const netDebtToEbitda =
    netDebt != null && ebitda != null && ebitda > 0 ? netDebt / ebitda : null;
  const currentRatio =
    currentAssets != null && currentLiabilities != null && currentLiabilities !== 0
      ? currentAssets / currentLiabilities
      : null;
  const fcf = ocf != null && capex != null ? ocf - capex : null;
  const fcfPrior = ocfPrior != null && capexPrior != null ? ocfPrior - capexPrior : null;
  const interestCoverage = op != null && interest != null && interest > 0 ? op / interest : null;

  const assetBase = assets != null && assetsPrior != null ? (assets + assetsPrior) / 2 : assets;
  const nim = nii != null && assetBase != null && assetBase > 0 ? (nii / assetBase) * 100 : null;
  const efficiencyDenom = (nii ?? 0) + (niiOther ?? 0);
  const efficiency =
    nie != null && (nii != null || niiOther != null) && efficiencyDenom > 0
      ? (nie / efficiencyDenom) * 100
      : null;

  let cet1: number | null = null;
  if (cet1Raw != null) cet1 = cet1Raw <= 1.5 ? cet1Raw * 100 : cet1Raw;

  const npl = nonaccrual != null && loans != null && loans > 0 ? (nonaccrual / loans) * 100 : null;
  const nplCoverage =
    allowance != null && nonaccrual != null && nonaccrual > 0 ? (allowance / nonaccrual) * 100 : null;

  const ffo = netIncome != null && da != null ? netIncome + Math.abs(da) : null;
  const ffoPrior =
    near(snapshot.netIncome, priorPeriod) != null && daPrior != null
      ? (near(snapshot.netIncome, priorPeriod) as number) + Math.abs(daPrior)
      : null;
  const affo = ffo != null && capex != null ? ffo - capex : null;
  const ffoMargin = pct(ffo, revenue);
  const debtToAssets = debt != null && assets != null && assets > 0 ? (debt / assets) * 100 : null;
  let affoPayout: number | null = null;
  if (dividends != null && affo != null) {
    if (affo > 0) affoPayout = (Math.abs(dividends) / affo) * 100;
    else if (Math.abs(dividends) > 0) affoPayout = 999;
  }

  const metrics: Metrics = {
    period,
    priorPeriod,
    revenue,
    revenuePrior,
    revenueGrowth,
    grossMargin,
    netMargin,
    operatingMargin,
    operatingMarginPrior,
    roic,
    roe,
    netDebtToEbitda,
    currentRatio,
    fcf,
    fcfPrior,
    interestCoverage,
    operatingCashFlow: ocf,
    capex,
    ebitda,
    netDebt,
    totalDebt: debt,
    efficiency,
    nim,
    cet1,
    npl,
    nplCoverage,
    ffo,
    ffoPrior,
    affo,
    ffoMargin,
    debtToAssets,
    occupancy: null,
    affoPayout,
    notes,
  };

  const merged = { ...metrics };
  for (const [key, value] of Object.entries(overrides) as Array<[keyof MetricOverrides, number | null | undefined]>) {
    if (value === undefined) continue;
    if (value !== null && !Number.isFinite(value)) continue;
    merged[key] = value;
  }
  merged.notes = notes;
  return merged;
}

function num(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/d";
  return value.toLocaleString("es-MX", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/d";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}US$ ${num(abs / 1e12, 2)} billones`;
  if (abs >= 1e9) return `${sign}US$ ${num(abs / 1e9, 1)} mil millones`;
  if (abs >= 1e6) return `${sign}US$ ${num(abs / 1e6, 1)} millones`;
  return `${sign}US$ ${num(abs, 0)}`;
}

export function routeModel(input: {
  sectorText: string;
  sic: number | null;
  sicDescription: string;
  name: string;
  forced: ModelId | null;
}): { model: ModelId; reason: string } {
  if (input.forced) {
    return { model: input.forced, reason: "Modelo elegido de forma manual." };
  }
  const text = `${input.sectorText} ${input.sicDescription} ${input.name}`.toLowerCase();
  if (/reit|inmobiliari|fideicomiso|real estate|bienes ra[ií]ces/.test(text) || input.sic === 6798) {
    return { model: 4, reason: "Actividad de alquiler o fideicomiso inmobiliario." };
  }
  if (/fintech|software|tecnolog/.test(text) && !/banco|bank/.test(text)) {
    return { model: 1, reason: "Actividad comercial o tecnológica, no un banco tradicional." };
  }
  if (
    /banco|bank|instituci[oó]n financiera|servicios financieros|cr[eé]dito comercial|banca/.test(text) ||
    (input.sic != null && ((input.sic >= 6020 && input.sic <= 6069) || (input.sic >= 6090 && input.sic <= 6099) || input.sic === 6712 || input.sic === 6211))
  ) {
    return { model: 2, reason: "Institución financiera tradicional según sector o SIC." };
  }
  if (
    /utilit|el[eé]ctric|electric|agua|\bgas\b|water|gas natural|energ[ií]a regulad|infraestruct/.test(text) ||
    (input.sic != null && input.sic >= 4900 && input.sic <= 4991)
  ) {
    return { model: 3, reason: "Servicio público regulado o infraestructura energética." };
  }
  return { model: 1, reason: "Sector comercial estándar: productos o servicios." };
}

function pushGap(list: string[], label: string, value: number | null) {
  if (value == null) list.push(`Dato no disponible en la fuente pública: ${label}.`);
}

export function diagnose(input: {
  model: ModelId;
  metrics: Metrics;
  company: string;
}): Report {
  const m = input.metrics;
  const pros: string[] = [];
  const contras: string[] = [];
  let verdict: Verdict = "ESTABLE/EN OBSERVACIÓN";
  let rentabilidad = "";
  let riesgo = "";
  let flujo = "";

  if (input.model === 1) {
    if (m.revenueGrowth != null && m.revenueGrowth >= -2) pros.push(`Ingresos ${m.revenueGrowth >= 0 ? "crecientes" : "estables"}: ${num(m.revenueGrowth)}%.`);
    if (m.grossMargin != null && m.grossMargin > 40) pros.push(`Margen bruto ${num(m.grossMargin)}%, por encima del 40%.`);
    if (m.roic != null && m.roic > 15) pros.push(`ROIC ${num(m.roic)}%, por encima del 15%.`);
    if (m.netDebtToEbitda != null && m.netDebtToEbitda < 2.5) pros.push(`Deuda neta / EBITDA ${num(m.netDebtToEbitda, 2)}x, bajo 2.5x.`);
    if (m.currentRatio != null && m.currentRatio > 1.2) pros.push(`Liquidez ${num(m.currentRatio, 2)}, por encima de 1.2.`);
    if (m.fcf != null && m.fcf > 0) pros.push(`Flujo de caja libre positivo: ${money(m.fcf)}.`);
    if (m.fcf != null && m.fcf < 0 && m.fcfPrior != null && m.fcfPrior < 0) contras.push(`FCF negativo recurrente: ${money(m.fcf)} y antes ${money(m.fcfPrior)}.`);
    if (m.netDebtToEbitda != null && m.netDebtToEbitda > 4.5) contras.push(`Deuda neta / EBITDA ${num(m.netDebtToEbitda, 2)}x, por encima de 4.5x.`);
    if (m.currentRatio != null && m.currentRatio < 1) contras.push(`Ratio de liquidez ${num(m.currentRatio, 2)}, por debajo de 1.0.`);
    const mal = contras.some((line) => !line.startsWith("Dato no disponible"));
    const bien =
      m.revenueGrowth != null && m.revenueGrowth >= -2 &&
      m.grossMargin != null && m.grossMargin > 40 &&
      m.roic != null && m.roic > 15 &&
      m.netDebtToEbitda != null && m.netDebtToEbitda < 2.5 &&
      m.currentRatio != null && m.currentRatio > 1.2 &&
      m.fcf != null && m.fcf > 0;
    if (mal) verdict = "MAL";
    else if (bien) verdict = "BIEN";
    else {
      pushGap(contras, "crecimiento de ingresos", m.revenueGrowth);
      pushGap(contras, "margen bruto", m.grossMargin);
      pushGap(contras, "ROIC", m.roic);
      pushGap(contras, "deuda neta / EBITDA", m.netDebtToEbitda);
      pushGap(contras, "liquidez", m.currentRatio);
      pushGap(contras, "flujo de caja libre", m.fcf);
    }
    rentabilidad = `ROIC ${num(m.roic)}% sobre el capital invertido. Margen bruto ${num(m.grossMargin)}% y margen neto ${num(m.netMargin)}%. Los ingresos del periodo ${m.period ?? "n/d"} fueron ${money(m.revenue)}, con variación de ${num(m.revenueGrowth)}% frente al ejercicio previo.`;
    riesgo = `Deuda neta ${money(m.netDebt)} equivale a ${num(m.netDebtToEbitda, 2)}x el EBITDA (${money(m.ebitda)}). El límite holgado de este modelo es 2.5x y el de alerta es 4.5x. Liquidez corriente ${num(m.currentRatio, 2)} (umbral sano > 1.2; alerta < 1.0).`;
    flujo = `El flujo de caja libre del ejercicio es ${money(m.fcf)} (operación ${money(m.operatingCashFlow)} menos CapEx ${money(m.capex)}). El ejercicio previo cerró en ${money(m.fcfPrior)}.`;
  }

  if (input.model === 2) {
    if (m.efficiency != null && m.efficiency < 55) pros.push(`Ratio de eficiencia ${num(m.efficiency)}%, mejor que 55%.`);
    if (m.roe != null && m.roe > 12) pros.push(`ROE ${num(m.roe)}%, por encima del 12%.`);
    if (m.cet1 != null && m.cet1 > 11.5) pros.push(`CET1 ${num(m.cet1, 2)}%, por encima del 11.5%.`);
    if (m.npl != null && m.npl < 3) pros.push(`Morosidad ${num(m.npl, 2)}%, por debajo del 3%.`);
    if (m.nplCoverage != null && m.nplCoverage > 100) pros.push(`Cobertura de morosidad ${num(m.nplCoverage)}%, por encima del 100%.`);
    if (m.cet1 != null && m.cet1 < 10.5) contras.push(`CET1 ${num(m.cet1, 2)}%, por debajo del 10.5%.`);
    if (m.efficiency != null && m.efficiency > 65) contras.push(`Eficiencia ${num(m.efficiency)}%, peor que 65%.`);
    if (m.npl != null && m.npl >= 3 && (m.nplCoverage == null || m.nplCoverage < 100)) {
      contras.push(`Morosidad ${num(m.npl, 2)}% sin cobertura suficiente (${num(m.nplCoverage)}%).`);
    }
    const mal = contras.some((line) => !line.startsWith("Dato no disponible"));
    const bien =
      m.efficiency != null && m.efficiency < 55 &&
      m.roe != null && m.roe > 12 &&
      m.cet1 != null && m.cet1 > 11.5 &&
      m.npl != null && m.npl < 3 &&
      m.nplCoverage != null && m.nplCoverage > 100;
    if (mal) verdict = "MAL";
    else if (bien) verdict = "BIEN";
    else {
      pushGap(contras, "ratio de eficiencia", m.efficiency);
      pushGap(contras, "ROE", m.roe);
      pushGap(contras, "CET1", m.cet1);
      pushGap(contras, "morosidad", m.npl);
      pushGap(contras, "cobertura de morosidad", m.nplCoverage);
    }
    rentabilidad = `ROE ${num(m.roe)}%. El margen de interés neto aproximado, medido sobre activos, es ${num(m.nim)}%. La rentabilidad exigida de este modelo es ROE mayor a 12%.`;
    riesgo = `CET1 ${num(m.cet1, 2)}% (sano > 11.5%; alerta < 10.5%). Morosidad ${num(m.npl, 2)}% con cobertura de provisiones ${num(m.nplCoverage)}%. Eficiencia ${num(m.efficiency)}% (sano < 55%; alerta > 65%).`;
    flujo = `En un banco el dinero real se lee por la cobertura de la morosidad y por la capacidad de sostener el margen. Cobertura ${num(m.nplCoverage)}% y margen de interés neto aproximado ${num(m.nim)}%.`;
  }

  if (input.model === 3) {
    const marginStable =
      m.operatingMargin != null &&
      m.operatingMarginPrior != null &&
      Math.abs(m.operatingMargin - m.operatingMarginPrior) <= 3;
    if (marginStable) pros.push(`Margen operativo estable: ${num(m.operatingMargin)}% frente a ${num(m.operatingMarginPrior)}%.`);
    if (m.netDebtToEbitda != null && m.netDebtToEbitda <= 4.5) pros.push(`Deuda neta / EBITDA ${num(m.netDebtToEbitda, 2)}x, dentro del 4.5x permitido.`);
    if (m.interestCoverage != null && m.interestCoverage > 3) pros.push(`Cobertura de intereses ${num(m.interestCoverage, 2)}x, por encima de 3x.`);
    if (m.operatingCashFlow != null && m.capex != null && m.operatingCashFlow > m.capex) {
      pros.push(`Flujo operativo ${money(m.operatingCashFlow)} cubre el CapEx ${money(m.capex)}.`);
    }
    if (m.netDebtToEbitda != null && m.netDebtToEbitda > 6) contras.push(`Deuda neta / EBITDA ${num(m.netDebtToEbitda, 2)}x, por encima de 6x.`);
    if (m.interestCoverage != null && m.interestCoverage < 1.5) contras.push(`Cobertura de intereses ${num(m.interestCoverage, 2)}x, por debajo de 1.5x.`);
    if (m.operatingCashFlow != null && m.capex != null && m.operatingCashFlow < m.capex) {
      contras.push(`Flujo operativo ${money(m.operatingCashFlow)} no cubre el CapEx básico ${money(m.capex)}.`);
    }
    const mal = contras.some((line) => !line.startsWith("Dato no disponible"));
    const bien =
      marginStable &&
      m.netDebtToEbitda != null && m.netDebtToEbitda <= 4.5 &&
      m.interestCoverage != null && m.interestCoverage > 3 &&
      m.operatingCashFlow != null && m.capex != null && m.operatingCashFlow > m.capex;
    if (mal) verdict = "MAL";
    else if (bien) verdict = "BIEN";
    else {
      if (!marginStable) pushGap(contras, "estabilidad del margen operativo (faltan dos ejercicios)", m.operatingMargin != null && m.operatingMarginPrior != null ? 0 : null);
      pushGap(contras, "deuda neta / EBITDA", m.netDebtToEbitda);
      pushGap(contras, "cobertura de intereses", m.interestCoverage);
      pushGap(contras, "flujo operativo", m.operatingCashFlow);
      pushGap(contras, "CapEx", m.capex);
    }
    rentabilidad = `Margen operativo ${num(m.operatingMargin)}% en ${m.period ?? "el último ejercicio"} y ${num(m.operatingMarginPrior)}% en el previo. Este modelo premia un margen plano, no un pico.`;
    riesgo = `Deuda neta / EBITDA ${num(m.netDebtToEbitda, 2)}x. En utilities se tolera hasta 4.5x y se alerta por encima de 6x. Cobertura de intereses ${num(m.interestCoverage, 2)}x.`;
    flujo = `Flujo operativo ${money(m.operatingCashFlow)} frente a CapEx ${money(m.capex)}. El flujo tiene que cubrir con holgura la inversión de mantenimiento.`;
  }

  if (input.model === 4) {
    const ffoGrowing = m.ffo != null && m.ffoPrior != null && m.ffo > m.ffoPrior;
    if (m.occupancy != null && m.occupancy > 90) pros.push(`Ocupación ${num(m.occupancy)}%, por encima del 90%.`);
    if (ffoGrowing) pros.push(`FFO creciente: ${money(m.ffo)} frente a ${money(m.ffoPrior)}.`);
    if (m.debtToAssets != null && m.debtToAssets < 50) pros.push(`Deuda / activos ${num(m.debtToAssets)}%, bajo el 50%.`);
    if (m.affoPayout != null && m.affoPayout < 90) pros.push(`Payout del AFFO ${num(m.affoPayout)}%, cubierto bajo el 90%.`);
    if (m.occupancy != null && m.occupancy < 80) contras.push(`Ocupación ${num(m.occupancy)}%, por debajo del 80%.`);
    if (m.ffo != null && m.ffoPrior != null && m.ffoPrior > 0 && m.ffo < m.ffoPrior * 0.8) {
      contras.push(`FFO en caída: ${money(m.ffo)} frente a ${money(m.ffoPrior)}.`);
    }
    if (m.debtToAssets != null && m.debtToAssets > 70) contras.push(`Deuda / activos ${num(m.debtToAssets)}%, por encima del 70%.`);
    if (m.affoPayout != null && m.affoPayout > 100) contras.push(`Dividendo no cubierto por el AFFO: payout ${num(m.affoPayout)}%.`);
    const mal = contras.some((line) => !line.startsWith("Dato no disponible"));
    const bien =
      m.occupancy != null && m.occupancy > 90 &&
      ffoGrowing &&
      m.debtToAssets != null && m.debtToAssets < 50 &&
      m.affoPayout != null && m.affoPayout < 90;
    if (mal) verdict = "MAL";
    else if (bien) verdict = "BIEN";
    else {
      pushGap(contras, "ocupación (no suele venir en XBRL; captúrala)", m.occupancy);
      pushGap(contras, "FFO", m.ffo);
      pushGap(contras, "FFO del ejercicio previo", m.ffoPrior);
      pushGap(contras, "deuda / activos", m.debtToAssets);
      pushGap(contras, "payout del AFFO", m.affoPayout);
    }
    rentabilidad = `FFO ${money(m.ffo)} y AFFO ${money(m.affo)} (FFO menos CapEx, aproximación conservadora). Margen FFO ${num(m.ffoMargin)}%. El ejercicio previo de FFO fue ${money(m.ffoPrior)}.`;
    riesgo = `Deuda total / activos ${num(m.debtToAssets)}%. El modelo acepta menos de 50% y alerta por encima de 70%. Ocupación ${num(m.occupancy)}%.`;
    flujo = `El dividendo queda cubierto si el payout del AFFO es menor a 90%. Hoy el payout es ${num(m.affoPayout)}% sobre un AFFO de ${money(m.affo)}.`;
  }

  const uniqueContras = [...new Set(contras)];
  const uniquePros = [...new Set(pros)];
  if (uniquePros.length === 0) uniquePros.push("Ninguna métrica supera, con dato presente, el umbral sano de este modelo.");
  if (uniqueContras.length === 0) uniqueContras.push("Ninguna métrica presente incumple el mínimo de alerta de este modelo.");

  return {
    model: input.model,
    modelName: MODEL_NAME[input.model],
    verdict,
    rentabilidad,
    riesgo,
    flujo,
    pros: uniquePros,
    contras: uniqueContras,
    metrics: m,
  };
}

export function parseOverrides(raw: unknown): MetricOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const aliases: Record<string, keyof MetricOverrides> = {
    crecimientodeingresos: "revenueGrowth",
    revenuegrowth: "revenueGrowth",
    margenbruto: "grossMargin",
    grossmargin: "grossMargin",
    margenneto: "netMargin",
    netmargin: "netMargin",
    margenoperativo: "operatingMargin",
    operatingmargin: "operatingMargin",
    margenoperativoprevio: "operatingMarginPrior",
    roic: "roic",
    roe: "roe",
    deudanetadebitda: "netDebtToEbitda",
    netdebttoebitda: "netDebtToEbitda",
    liquidez: "currentRatio",
    currentratio: "currentRatio",
    fcf: "fcf",
    fcfprevio: "fcfPrior",
    coberturadeintereses: "interestCoverage",
    interestcoverage: "interestCoverage",
    flujooperativo: "operatingCashFlow",
    capex: "capex",
    eficiencia: "efficiency",
    efficiency: "efficiency",
    nim: "nim",
    cet1: "cet1",
    morosidad: "npl",
    npl: "npl",
    coberturamorosidad: "nplCoverage",
    nplcoverage: "nplCoverage",
    ffo: "ffo",
    ffoprevio: "ffoPrior",
    affo: "affo",
    margenffo: "ffoMargin",
    deudaactivos: "debtToAssets",
    debttoassets: "debtToAssets",
    ocupacion: "occupancy",
    occupancy: "occupancy",
    payoutaffo: "affoPayout",
    affopayout: "affoPayout",
  };
  const out: MetricOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const norm = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const field = aliases[norm];
    if (!field) continue;
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : null;
    if (parsed == null || !Number.isFinite(parsed) || Math.abs(parsed) > 1e15) continue;
    out[field] = parsed;
  }
  return out;
}
