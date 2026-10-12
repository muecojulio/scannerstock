export type ModelId = 1 | 2 | 3 | 4;

export type Verdict = "BIEN" | "ESTABLE/EN OBSERVACIÓN" | "MAL";

export interface Point {
  end: string;
  value: number;
}

export interface Snapshot {
  revenue: Point[];
  grossProfit: Point[];
  costOfRevenue: Point[];
  netIncome: Point[];
  operatingIncome: Point[];
  pretax: Point[];
  tax: Point[];
  currentAssets: Point[];
  currentLiabilities: Point[];
  cash: Point[];
  equity: Point[];
  assets: Point[];
  operatingCashFlow: Point[];
  capex: Point[];
  depreciation: Point[];
  interestExpense: Point[];
  dividends: Point[];
  longDebtNoncurrent: Point[];
  longDebtCurrent: Point[];
  longDebt: Point[];
  commercialPaper: Point[];
  shortBorrowings: Point[];
  netInterestIncome: Point[];
  noninterestExpense: Point[];
  noninterestIncome: Point[];
  cet1: Point[];
  nonaccrual: Point[];
  allowance: Point[];
  loans: Point[];
}

export interface Metrics {
  period: string | null;
  priorPeriod: string | null;
  revenue: number | null;
  revenuePrior: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  operatingMargin: number | null;
  operatingMarginPrior: number | null;
  roic: number | null;
  roe: number | null;
  netDebtToEbitda: number | null;
  currentRatio: number | null;
  fcf: number | null;
  fcfPrior: number | null;
  interestCoverage: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  ebitda: number | null;
  netDebt: number | null;
  totalDebt: number | null;
  efficiency: number | null;
  nim: number | null;
  cet1: number | null;
  npl: number | null;
  nplCoverage: number | null;
  ffo: number | null;
  ffoPrior: number | null;
  affo: number | null;
  ffoMargin: number | null;
  debtToAssets: number | null;
  occupancy: number | null;
  affoPayout: number | null;
  notes: string[];
}

/** Numeric overrides. Percents are percent points (40 = 40%). Ratios are multiples. */
export type MetricOverrides = Partial<
  Omit<Metrics, "period" | "priorPeriod" | "notes" | "revenue" | "revenuePrior" | "ebitda" | "netDebt" | "totalDebt">
>;

export interface Report {
  model: ModelId;
  modelName: string;
  verdict: Verdict;
  rentabilidad: string;
  riesgo: string;
  flujo: string;
  pros: string[];
  contras: string[];
  metrics: Metrics;
}
