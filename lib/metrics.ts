import { Company, Period, PeriodType } from "./types";

/** Every ratio is null when its inputs are missing or the result is not meaningful. */
export interface PeriodMetrics {
  revenueGrowth: number | null;
  ebitdaGrowth: number | null;
  netProfitGrowth: number | null;
  epsGrowth: number | null;
  ebit: number | null;
  ebitdaMargin: number | null;
  ebitMargin: number | null;
  netMargin: number | null;
  eps: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  netDebt: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
  fcf: number | null;
  fcfMargin: number | null;
  cashConversion: number | null;
  assetTurnover: number | null;
  effectiveTaxRate: number | null;
}

const div = (a: number | null, b: number | null): number | null =>
  a === null || b === null || b === 0 ? null : a / b;

/** Growth vs a comparison period. Returns null when the base is not positive (growth is not meaningful). */
export function growth(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev <= 0) return null;
  return cur / prev - 1;
}

export function cagr(first: number | null, last: number | null, years: number): number | null {
  if (first === null || last === null || first <= 0 || last <= 0 || years <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

export function epsOf(p: Period): number | null {
  if (p.v.eps !== null) return p.v.eps;
  if (p.v.net_profit !== null && p.v.shares_outstanding_cr) return p.v.net_profit / p.v.shares_outstanding_cr;
  return null;
}

export function ebitOf(p: Period): number | null {
  if (p.v.ebitda !== null && p.v.depreciation !== null) return p.v.ebitda - p.v.depreciation;
  if (p.v.pbt !== null && p.v.interest_expense !== null) return p.v.pbt + p.v.interest_expense;
  return null;
}

export function fcfOf(p: Period): number | null {
  if (p.v.cfo === null || p.v.capex === null) return null;
  return p.v.cfo - Math.abs(p.v.capex);
}

/**
 * Metrics for a series of periods of ONE type, already sorted by date.
 * Annual: growth vs previous fiscal year. Quarterly: growth vs same quarter last year (4 periods back, verified by fy/quarter).
 * Return-on-capital style ratios are only computed for annual periods (quarterly numbers are not annualised).
 */
export function computeMetrics(periods: Period[], type: PeriodType): PeriodMetrics[] {
  const find = (fy: number, q: number | null) => periods.find((p) => p.fy === fy && p.quarter === q);
  return periods.map((p, i) => {
    const prev = type === "annual" ? find(p.fy - 1, null) : find(p.fy - 1, p.quarter);
    const prevSeq = i > 0 ? periods[i - 1] : undefined; // sequential predecessor for averages
    const v = p.v;
    const ebit = ebitOf(p);
    const eps = epsOf(p);
    const prevEps = prev ? epsOf(prev) : null;
    const fcf = fcfOf(p);
    const annual = type === "annual";

    const avgEquity =
      v.total_equity !== null && prev && prev.v.total_equity !== null && annual
        ? (v.total_equity + prev.v.total_equity) / 2
        : v.total_equity;
    const capEmployed =
      v.total_assets !== null && v.current_liabilities !== null ? v.total_assets - v.current_liabilities : null;
    const netDebt = v.total_debt !== null && v.cash !== null ? v.total_debt - v.cash : null;
    void prevSeq;

    return {
      revenueGrowth: prev ? growth(v.revenue, prev.v.revenue) : null,
      ebitdaGrowth: prev ? growth(v.ebitda, prev.v.ebitda) : null,
      netProfitGrowth: prev ? growth(v.net_profit, prev.v.net_profit) : null,
      epsGrowth: growth(eps, prevEps),
      ebit,
      ebitdaMargin: div(v.ebitda, v.revenue),
      ebitMargin: div(ebit, v.revenue),
      netMargin: div(v.net_profit, v.revenue),
      eps,
      roe: annual ? div(v.net_profit, avgEquity) : null,
      roce: annual ? div(ebit, capEmployed) : null,
      debtToEquity: div(v.total_debt, v.total_equity),
      netDebt,
      netDebtToEbitda: annual && netDebt !== null && v.ebitda !== null && v.ebitda > 0 ? netDebt / v.ebitda : null,
      interestCoverage: v.interest_expense && v.interest_expense > 0 ? div(ebit, v.interest_expense) : null,
      currentRatio: div(v.current_assets, v.current_liabilities),
      fcf,
      fcfMargin: div(fcf, v.revenue),
      cashConversion: v.ebitda !== null && v.ebitda > 0 ? div(v.cfo, v.ebitda) : null,
      assetTurnover: annual ? div(v.revenue, v.total_assets) : null,
      effectiveTaxRate: v.pbt !== null && v.pbt > 0 ? div(v.tax, v.pbt) : null,
    };
  });
}

export function periodsOfType(c: Company, type: PeriodType): Period[] {
  return c.periods.filter((p) => p.type === type).sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
}

export function latestAnnual(c: Company): Period | undefined {
  const a = periodsOfType(c, "annual");
  return a[a.length - 1];
}

/** Latest share price + shares across all periods (annual preferred), used for market cap. */
export function latestMarket(c: Company): { price: number | null; priceDate: string; shares: number | null } {
  const ps = [...c.periods].sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
  const withPrice = ps.find((p) => p.v.share_price !== null);
  const withShares = ps.find((p) => p.v.shares_outstanding_cr !== null);
  return {
    price: withPrice?.v.share_price ?? null,
    priceDate: withPrice?.priceDate ?? "",
    shares: withShares?.v.shares_outstanding_cr ?? null,
  };
}

export function marketCap(c: Company): number | null {
  const m = latestMarket(c);
  return m.price !== null && m.shares !== null ? m.price * m.shares : null;
}

/**
 * Indicative market-cap bucket. IMPORTANT: SEBI/AMFI classify by RANK (top 100 = large, 101–250 = mid, rest = small)
 * and republish the list every six months. This app has no ranking universe, so it uses fixed ₹-crore thresholds
 * that you can edit here. Treat the label as indicative only.
 */
export const MCAP_THRESHOLDS_CR = { large: 100000, mid: 30000 };

export function mcapCategory(capCr: number | null): "Large cap" | "Mid cap" | "Small cap" | "Unknown" {
  if (capCr === null) return "Unknown";
  if (capCr >= MCAP_THRESHOLDS_CR.large) return "Large cap";
  if (capCr >= MCAP_THRESHOLDS_CR.mid) return "Mid cap";
  return "Small cap";
}

/* ---------------- data quality ---------------- */

export interface QualityRow {
  period: Period;
  missing: string[];
}

const CORE_FIELDS_BY_TYPE: Record<PeriodType, string[]> = {
  annual: [
    "revenue", "ebitda", "depreciation", "interest_expense", "pbt", "tax", "net_profit", "eps",
    "total_assets", "total_equity", "total_debt", "cash", "current_assets", "current_liabilities",
    "cfo", "capex",
  ],
  quarterly: ["revenue", "ebitda", "depreciation", "interest_expense", "pbt", "tax", "net_profit", "eps"],
};

export function qualityReport(periods: Period[], type: PeriodType): QualityRow[] {
  return periods.map((p) => ({
    period: p,
    missing: CORE_FIELDS_BY_TYPE[type].filter((k) => p.v[k as keyof typeof p.v] === null),
  }));
}
