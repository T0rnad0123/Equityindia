import { Company } from "./types";
import { cagr, ebitOf, epsOf, latestAnnual, latestMarket, marketCap, mcapCategory, periodsOfType } from "./metrics";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ScenarioKey = "bear" | "base" | "bull";
export const SCENARIO_KEYS: ScenarioKey[] = ["bear", "base", "bull"];
export const SCENARIO_LABEL: Record<ScenarioKey, string> = { bear: "Bear", base: "Base", bull: "Bull" };

/** Assumptions that differ by scenario (all fractions, e.g. 0.12 = 12%). */
export interface ScenarioInputs {
  growthStart: number; // revenue growth in forecast year 1
  growthEnd: number; // revenue growth in the final forecast year (linear fade)
  ebitdaMargin: number; // EBITDA margin reached in the final forecast year (linear path from baseMargin)
  wacc: number;
  terminalGrowth: number;
}

/** Assumptions shared by all scenarios. Money in INR crore. */
export interface SharedInputs {
  years: number; // explicit forecast years
  taxRate: number;
  daPct: number; // D&A as % of revenue
  capexPct: number; // capex as % of revenue
  nwcPct: number; // incremental net working capital as % of incremental revenue
  baseRevenue: number;
  baseMargin: number;
  netDebt: number;
  shares: number; // crore shares
}

export interface DcfYear {
  year: number;
  revenue: number;
  growth: number;
  ebitda: number;
  margin: number;
  da: number;
  ebit: number;
  tax: number;
  nopat: number;
  capex: number;
  dNwc: number;
  fcff: number;
  discountFactor: number;
  pv: number;
}

export interface DcfResult {
  valid: boolean;
  reason?: string;
  years: DcfYear[];
  sumPv: number;
  terminalValue: number;
  pvTerminal: number;
  ev: number;
  netDebt: number;
  equity: number;
  perShare: number | null;
  terminalShare: number;
}

export type MultipleKey = "pe" | "evEbitda" | "evSales" | "pb";
export const MULTIPLE_KEYS: MultipleKey[] = ["pe", "evEbitda", "evSales", "pb"];
export const MULTIPLE_LABEL: Record<MultipleKey, string> = {
  pe: "P/E",
  evEbitda: "EV/EBITDA",
  evSales: "EV/Sales",
  pb: "P/B",
};

export interface PeerRow {
  ticker: string;
  name: string;
  sector: string;
  origin: "demo" | "upload";
  mcap: number | null;
  mcapCategory: string;
  ev: number | null;
  pe: number | null;
  evEbitda: number | null;
  evSales: number | null;
  pb: number | null;
  asOf: string; // latest annual period label used
}

export interface ValState {
  priceOverride: number | null;
  shared: SharedInputs;
  scenarios: Record<ScenarioKey, ScenarioInputs>;
  active: ScenarioKey;
  included: Record<string, boolean>;
  sectorFilter: "same" | "all";
  minMcap: number;
  sortKey: "name" | "mcap" | MultipleKey;
  sortDir: "asc" | "desc";
  multipleOverride: Partial<Record<MultipleKey, number | null>>;
}

/* -------------------------------------------------------------------------- */
/* DCF                                                                        */
/* -------------------------------------------------------------------------- */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function runDcf(shared: SharedInputs, sc: ScenarioInputs): DcfResult {
  const empty: DcfResult = {
    valid: false,
    years: [],
    sumPv: 0,
    terminalValue: 0,
    pvTerminal: 0,
    ev: 0,
    netDebt: shared.netDebt,
    equity: 0,
    perShare: null,
    terminalShare: 0,
  };
  if (!(shared.baseRevenue > 0)) return { ...empty, reason: "Base revenue is missing or not positive." };
  if (sc.wacc <= sc.terminalGrowth) return { ...empty, reason: "WACC must be greater than terminal growth." };
  if (sc.wacc <= 0) return { ...empty, reason: "WACC must be positive." };
  const n = Math.max(1, Math.min(15, Math.round(shared.years)));

  const years: DcfYear[] = [];
  let prevRev = shared.baseRevenue;
  let sumPv = 0;
  for (let t = 1; t <= n; t++) {
    const frac = n === 1 ? 1 : (t - 1) / (n - 1);
    const growth = lerp(sc.growthStart, sc.growthEnd, frac);
    const margin = lerp(shared.baseMargin, sc.ebitdaMargin, t / n);
    const revenue = prevRev * (1 + growth);
    const ebitda = revenue * margin;
    const da = revenue * shared.daPct;
    const ebit = ebitda - da;
    const tax = Math.max(0, ebit) * shared.taxRate;
    const nopat = ebit - tax;
    const capex = revenue * shared.capexPct;
    const dNwc = (revenue - prevRev) * shared.nwcPct;
    const fcff = nopat + da - capex - dNwc;
    const discountFactor = 1 / Math.pow(1 + sc.wacc, t);
    const pv = fcff * discountFactor;
    sumPv += pv;
    years.push({ year: t, revenue, growth, ebitda, margin, da, ebit, tax, nopat, capex, dNwc, fcff, discountFactor, pv });
    prevRev = revenue;
  }
  const last = years[years.length - 1];
  const terminalValue = (last.fcff * (1 + sc.terminalGrowth)) / (sc.wacc - sc.terminalGrowth);
  const pvTerminal = terminalValue * last.discountFactor;
  const ev = sumPv + pvTerminal;
  const equity = ev - shared.netDebt;
  const perShare = shared.shares > 0 ? equity / shared.shares : null;
  return {
    valid: true,
    years,
    sumPv,
    terminalValue,
    pvTerminal,
    ev,
    netDebt: shared.netDebt,
    equity,
    perShare,
    terminalShare: ev !== 0 ? pvTerminal / ev : 0,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Starting assumptions derived from the company's own history. They are transparent, editable defaults –
 * NOT forecasts. Bull/bear are a fixed, arbitrary spread around base.
 */
export function deriveDcfDefaults(c: Company): { shared: SharedInputs; scenarios: Record<ScenarioKey, ScenarioInputs>; notes: string[] } {
  const annual = periodsOfType(c, "annual");
  const last = annual[annual.length - 1];
  const first = annual[0];
  const notes: string[] = [];
  const mk = latestMarket(c);

  const baseRevenue = last?.v.revenue ?? 0;
  const baseMargin = last && last.v.ebitda !== null && last.v.revenue ? last.v.ebitda / last.v.revenue : 0.15;
  if (!last || last.v.ebitda === null) notes.push("EBITDA margin not available for the latest year; 15% used as a placeholder – please edit.");

  const years = annual.length > 1 && first && last ? last.fy - first.fy : 0;
  const hist = first && last ? cagr(first.v.revenue, last.v.revenue, years) : null;
  const growthStart = hist !== null ? clamp(hist, 0.03, 0.2) : 0.08;
  notes.push(
    hist !== null
      ? `Year-1 growth starts at the ${years}-year revenue CAGR (${(hist * 100).toFixed(1)}%), clamped to 3–20%.`
      : "Revenue CAGR could not be computed; 8% used as a placeholder."
  );

  const da = last && last.v.depreciation !== null && last.v.revenue ? last.v.depreciation / last.v.revenue : 0.03;
  const capex = last && last.v.capex !== null && last.v.revenue ? Math.abs(last.v.capex) / last.v.revenue : Math.max(da * 1.2, 0.03);
  if (!last || last.v.capex === null) notes.push("Capex % of revenue not available; set to 1.2× D&A (placeholder).");

  let taxRate = 0.2517;
  if (last && last.v.pbt && last.v.pbt > 0 && last.v.tax !== null) {
    taxRate = clamp(last.v.tax / last.v.pbt, 0.15, 0.35);
    notes.push(`Tax rate taken from the latest effective rate (${(taxRate * 100).toFixed(1)}%), clamped to 15–35%.`);
  } else {
    notes.push("Tax rate set to 25.17% (the new-regime base corporate rate incl. surcharge and cess – verify applicability).");
  }

  let nwcPct = 0.1;
  if (last && last.v.current_assets !== null && last.v.current_liabilities !== null && last.v.revenue) {
    const cashV = last.v.cash ?? 0;
    nwcPct = clamp((last.v.current_assets - cashV - last.v.current_liabilities) / last.v.revenue, 0, 0.3);
    notes.push(`Working-capital intensity derived from the latest balance sheet (${(nwcPct * 100).toFixed(1)}% of revenue), clamped to 0–30%.`);
  } else {
    notes.push("Working-capital intensity set to 10% of incremental revenue (placeholder).");
  }

  const netDebt = last && last.v.total_debt !== null && last.v.cash !== null ? last.v.total_debt - last.v.cash : last?.v.total_debt ?? 0;
  if (!last || last.v.total_debt === null) notes.push("Borrowings missing for the latest year; net debt set to 0 – please edit.");

  const shared: SharedInputs = {
    years: 5,
    taxRate,
    daPct: clamp(da, 0, 0.3),
    capexPct: clamp(capex, 0, 0.4),
    nwcPct,
    baseRevenue,
    baseMargin: clamp(baseMargin, -0.5, 0.95),
    netDebt,
    shares: mk.shares ?? 0,
  };
  if (!mk.shares) notes.push("Shares outstanding missing: per-share values cannot be computed until you enter a share count.");

  const base: ScenarioInputs = {
    growthStart,
    growthEnd: Math.min(0.06, growthStart),
    ebitdaMargin: shared.baseMargin,
    wacc: 0.12,
    terminalGrowth: 0.05,
  };
  notes.push("WACC 12% and terminal growth 5% are illustrative starting points, not estimates for this company.");
  const scenarios: Record<ScenarioKey, ScenarioInputs> = {
    base,
    bull: {
      growthStart: base.growthStart + 0.03,
      growthEnd: base.growthEnd + 0.01,
      ebitdaMargin: base.ebitdaMargin + 0.02,
      wacc: base.wacc - 0.01,
      terminalGrowth: base.terminalGrowth + 0.005,
    },
    bear: {
      growthStart: Math.max(0, base.growthStart - 0.03),
      growthEnd: Math.max(0, base.growthEnd - 0.015),
      ebitdaMargin: Math.max(0, base.ebitdaMargin - 0.02),
      wacc: base.wacc + 0.01,
      terminalGrowth: base.terminalGrowth - 0.005,
    },
  };
  notes.push("Bull/bear are a fixed spread around base (growth ±3pp, margin ±2pp, WACC ∓1pp, terminal growth ±0.5pp). Replace with your own views.");
  return { shared, scenarios, notes };
}

/* -------------------------------------------------------------------------- */
/* Sensitivity                                                                */
/* -------------------------------------------------------------------------- */

export interface SensGrid {
  title: string;
  rowLabel: string;
  colLabel: string;
  rows: number[]; // axis values (fractions)
  cols: number[];
  cells: (number | null)[][]; // per-share value (rows × cols)
  baseRow: number;
  baseCol: number;
}

export function sensitivityWaccG(shared: SharedInputs, sc: ScenarioInputs): SensGrid {
  const offsetsW = [-0.02, -0.01, 0, 0.01, 0.02];
  const offsetsG = [-0.01, -0.005, 0, 0.005, 0.01];
  const rows = offsetsW.map((d) => sc.wacc + d);
  const cols = offsetsG.map((d) => sc.terminalGrowth + d);
  const cells = rows.map((w) =>
    cols.map((g) => {
      const r = runDcf(shared, { ...sc, wacc: w, terminalGrowth: g });
      return r.valid ? r.perShare : null;
    })
  );
  return { title: "Value per share: WACC × terminal growth", rowLabel: "WACC", colLabel: "Terminal growth", rows, cols, cells, baseRow: 2, baseCol: 2 };
}

export function sensitivityGrowthMargin(shared: SharedInputs, sc: ScenarioInputs): SensGrid {
  const offsetsG = [-0.04, -0.02, 0, 0.02, 0.04];
  const offsetsM = [-0.04, -0.02, 0, 0.02, 0.04];
  const rows = offsetsG.map((d) => Math.max(-0.5, sc.growthStart + d));
  const cols = offsetsM.map((d) => sc.ebitdaMargin + d);
  const cells = rows.map((g) =>
    cols.map((m) => {
      const r = runDcf(shared, { ...sc, growthStart: g, ebitdaMargin: m });
      return r.valid ? r.perShare : null;
    })
  );
  return { title: "Value per share: year-1 revenue growth × terminal EBITDA margin", rowLabel: "Year-1 growth", colLabel: "Terminal EBITDA margin", rows, cols, cells, baseRow: 2, baseCol: 2 };
}

/* -------------------------------------------------------------------------- */
/* Comparable companies                                                       */
/* -------------------------------------------------------------------------- */

export function peerRow(c: Company): PeerRow {
  const a = latestAnnual(c);
  const mcap = marketCap(c);
  const debt = a?.v.total_debt ?? null;
  const cash = a?.v.cash ?? null;
  const ev = mcap !== null && debt !== null && cash !== null ? mcap + debt - cash : null;
  const pos = (n: number | null | undefined) => (n !== null && n !== undefined && n > 0 ? n : null);
  const np = pos(a?.v.net_profit);
  const ebitda = pos(a?.v.ebitda);
  const rev = pos(a?.v.revenue);
  const eq = pos(a?.v.total_equity);
  return {
    ticker: c.ticker,
    name: c.name,
    sector: c.sector,
    origin: c.origin,
    mcap,
    mcapCategory: mcapCategory(mcap),
    ev,
    pe: mcap !== null && np !== null ? mcap / np : null,
    evEbitda: ev !== null && ebitda !== null ? ev / ebitda : null,
    evSales: ev !== null && rev !== null ? ev / rev : null,
    pb: mcap !== null && eq !== null ? mcap / eq : null,
    asOf: a?.label ?? "",
  };
}

export interface MultipleStats {
  n: number;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function multipleStats(values: (number | null)[]): MultipleStats {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return { n: 0, min: null, q1: null, median: null, q3: null, max: null };
  return { n: v.length, min: v[0], q1: quantile(v, 0.25), median: quantile(v, 0.5), q3: quantile(v, 0.75), max: v[v.length - 1] };
}

export interface CompsLine {
  key: MultipleKey;
  label: string;
  stats: MultipleStats;
  used: number | null; // multiple applied (override or median)
  overridden: boolean;
  metricLabel: string;
  metric: number | null; // subject's metric the multiple is applied to (INR crore)
  low: number | null; // implied value per share at peer Q1
  mid: number | null; // at the multiple used
  high: number | null; // at peer Q3
}

export interface Valuation {
  price: number | null;
  priceDate: string;
  priceIsOverride: boolean;
  dcf: Record<ScenarioKey, DcfResult>;
  comps: CompsLine[];
  peers: PeerRow[]; // all candidate peers (before filters)
  selectedPeers: PeerRow[];
  football: { label: string; low: number; mid: number; high: number }[];
  sensitivityA: SensGrid;
  sensitivityB: SensGrid;
}

function perShareFromEquity(equity: number | null, shares: number): number | null {
  return equity !== null && shares > 0 ? equity / shares : null;
}

/** Peers added after the state was created (e.g. a later CSV upload) default to "included if same sector". */
export function isPeerIncluded(st: ValState, subject: Company, p: { ticker: string; sector: string }): boolean {
  const v = st.included[p.ticker];
  return v !== undefined ? v : p.sector === subject.sector;
}

export function buildValuation(subject: Company, all: Company[], st: ValState): Valuation {
  const mk = latestMarket(subject);
  const price = st.priceOverride ?? mk.price;
  const peers = all.filter((c) => c.ticker !== subject.ticker).map(peerRow);
  const selectedPeers = peers.filter((p) => isPeerIncluded(st, subject, p));
  const a = latestAnnual(subject);
  const shares = st.shared.shares;
  const netDebt = st.shared.netDebt;

  const subjectMetric: Record<MultipleKey, { label: string; value: number | null }> = {
    pe: { label: "Net profit", value: a?.v.net_profit ?? null },
    evEbitda: { label: "EBITDA", value: a?.v.ebitda ?? null },
    evSales: { label: "Revenue", value: a?.v.revenue ?? null },
    pb: { label: "Book equity", value: a?.v.total_equity ?? null },
  };

  const implied = (key: MultipleKey, mult: number | null): number | null => {
    const metric = subjectMetric[key].value;
    if (mult === null || metric === null || metric <= 0) return null;
    const x = mult * metric;
    return key === "pe" || key === "pb" ? perShareFromEquity(x, shares) : perShareFromEquity(x - netDebt, shares);
  };

  const comps: CompsLine[] = MULTIPLE_KEYS.map((key) => {
    const stats = multipleStats(selectedPeers.map((p) => p[key]));
    const ov = st.multipleOverride[key];
    const used = ov !== undefined && ov !== null ? ov : stats.median;
    return {
      key,
      label: MULTIPLE_LABEL[key],
      stats,
      used,
      overridden: ov !== undefined && ov !== null,
      metricLabel: subjectMetric[key].label,
      metric: subjectMetric[key].value,
      low: implied(key, stats.q1),
      mid: implied(key, used),
      high: implied(key, stats.q3),
    };
  });

  const dcf = {
    bear: runDcf(st.shared, st.scenarios.bear),
    base: runDcf(st.shared, st.scenarios.base),
    bull: runDcf(st.shared, st.scenarios.bull),
  };

  const football: Valuation["football"] = [];
  for (const c of comps) {
    if (c.low !== null && c.mid !== null && c.high !== null) {
      const lo = Math.min(c.low, c.mid, c.high);
      const hi = Math.max(c.low, c.mid, c.high);
      football.push({ label: `${c.label} (peer Q1–Q3)`, low: lo, mid: c.mid, high: hi });
    }
  }
  if (dcf.bear.perShare !== null && dcf.base.perShare !== null && dcf.bull.perShare !== null) {
    const vals = [dcf.bear.perShare, dcf.base.perShare, dcf.bull.perShare];
    football.push({ label: "DCF (bear–bull)", low: Math.min(...vals), mid: dcf.base.perShare, high: Math.max(...vals) });
  }

  const active = st.scenarios[st.active];
  return {
    price,
    priceDate: st.priceOverride !== null ? "" : mk.priceDate,
    priceIsOverride: st.priceOverride !== null,
    dcf,
    comps,
    peers,
    selectedPeers,
    football,
    sensitivityA: sensitivityWaccG(st.shared, active),
    sensitivityB: sensitivityGrowthMargin(st.shared, active),
  };
}

export function defaultValState(c: Company, all: Company[]): { state: ValState; notes: string[] } {
  const d = deriveDcfDefaults(c);
  const included: Record<string, boolean> = {};
  for (const o of all) if (o.ticker !== c.ticker) included[o.ticker] = o.sector === c.sector;
  return {
    notes: d.notes,
    state: {
      priceOverride: null,
      shared: d.shared,
      scenarios: d.scenarios,
      active: "base",
      included,
      sectorFilter: "same",
      minMcap: 0,
      sortKey: "mcap",
      sortDir: "desc",
      multipleOverride: {},
    },
  };
}

/** Upside/downside of an intrinsic value versus the reference price. */
export function upside(value: number | null, price: number | null): number | null {
  if (value === null || price === null || price <= 0) return null;
  return value / price - 1;
}

// re-exports used by UI
export { ebitOf, epsOf };
