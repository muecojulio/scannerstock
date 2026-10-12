import type { Point, Snapshot } from "./types";

type RawFact = {
  end?: string;
  start?: string;
  val?: number;
  form?: string;
  fp?: string;
  filed?: string;
};

const FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const DAY = 86_400_000;

function emptySnapshot(): Snapshot {
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

function asDoc(facts: unknown): Record<string, { units?: Record<string, RawFact[]> }> {
  if (!facts || typeof facts !== "object") return {};
  const root = facts as { facts?: Record<string, unknown> };
  const bag = root.facts ?? {};
  const merged: Record<string, { units?: Record<string, RawFact[]> }> = {};
  for (const ns of ["us-gaap", "ifrs-full"]) {
    const block = bag[ns];
    if (!block || typeof block !== "object") continue;
    for (const [tag, node] of Object.entries(block as Record<string, unknown>)) {
      if (!merged[tag]) merged[tag] = node as { units?: Record<string, RawFact[]> };
    }
  }
  return merged;
}

function seriesFor(doc: ReturnType<typeof asDoc>, tag: string, mode: "duration" | "instant"): Point[] {
  const node = doc[tag];
  if (!node?.units) return [];
  const byEnd = new Map<string, { value: number; filed: string }>();
  for (const rows of Object.values(node.units)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!FORMS.has(row.form ?? "")) continue;
      if (row.fp && row.fp !== "FY") continue;
      if (typeof row.end !== "string" || typeof row.val !== "number" || !Number.isFinite(row.val)) continue;
      const start = row.start;
      if (mode === "duration") {
        if (!start) continue;
        const span = (Date.parse(row.end) - Date.parse(start)) / DAY;
        if (span < 300 || span > 400) continue;
      } else if (start) {
        continue;
      }
      const prev = byEnd.get(row.end);
      const filed = row.filed ?? "";
      if (!prev || filed >= prev.filed) byEnd.set(row.end, { value: row.val, filed });
    }
  }
  return [...byEnd.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([end, row]) => ({ end, value: row.value }));
}

function best(doc: ReturnType<typeof asDoc>, tags: string[], mode: "duration" | "instant"): Point[] {
  let chosen: Point[] = [];
  for (const tag of tags) {
    const series = seriesFor(doc, tag, mode);
    if (series.length === 0) continue;
    const latest = series[series.length - 1]?.end ?? "";
    const prevLatest = chosen[chosen.length - 1]?.end ?? "";
    if (latest > prevLatest || (latest === prevLatest && series.length > chosen.length)) {
      chosen = series;
    }
  }
  return chosen;
}

export function extractSnapshot(facts: unknown): Snapshot {
  const doc = asDoc(facts);
  const snap = emptySnapshot();
  const duration: Array<[keyof Snapshot, string[]]> = [
    ["revenue", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RegulatedOperatingRevenue"]],
    ["grossProfit", ["GrossProfit"]],
    ["costOfRevenue", ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"]],
    ["netIncome", ["NetIncomeLoss", "ProfitLoss"]],
    ["operatingIncome", ["OperatingIncomeLoss"]],
    ["pretax", ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxes"]],
    ["tax", ["IncomeTaxExpenseBenefit"]],
    ["operatingCashFlow", ["NetCashProvidedByUsedInOperatingActivities"]],
    ["capex", ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]],
    ["depreciation", ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"]],
    ["interestExpense", ["InterestExpense", "InterestExpenseDebt", "InterestAndDebtExpense"]],
    ["dividends", ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"]],
    ["netInterestIncome", ["InterestIncomeExpenseNet", "NetInterestIncome"]],
    ["noninterestExpense", ["NoninterestExpense"]],
    ["noninterestIncome", ["NoninterestIncome"]],
  ];
  const instant: Array<[keyof Snapshot, string[]]> = [
    ["currentAssets", ["AssetsCurrent"]],
    ["currentLiabilities", ["LiabilitiesCurrent"]],
    ["cash", ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]],
    ["equity", ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]],
    ["assets", ["Assets"]],
    ["longDebtNoncurrent", ["LongTermDebtNoncurrent"]],
    ["longDebtCurrent", ["LongTermDebtCurrent"]],
    ["longDebt", ["LongTermDebt"]],
    ["commercialPaper", ["CommercialPaper"]],
    ["shortBorrowings", ["ShortTermBorrowings"]],
    ["cet1", ["CommonEquityTierOneCapitalRatio"]],
    ["nonaccrual", ["FinancingReceivableExcludingAccruedInterestNonaccrual", "LoansAndLeasesReceivableNonaccrual"]],
    ["allowance", ["AllowanceForLoanAndLeaseLosses", "FinancingReceivableAllowanceForCreditLosses"]],
    ["loans", ["LoansAndLeasesReceivableGrossCarryingAmount", "LoansAndLeasesReceivableNetReportedAmount"]],
  ];
  for (const [key, tags] of duration) snap[key] = best(doc, tags, "duration");
  for (const [key, tags] of instant) snap[key] = best(doc, tags, "instant");
  return snap;
}
