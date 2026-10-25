/**
 * Core data model.
 *
 * All monetary values are stored internally in INR crore (1 crore = 10,000,000).
 * Per-share values (EPS, share price) are in INR. Share counts are in crore shares.
 * Uploaded CSVs may use other units; the importer converts them (see lib/csv.ts).
 */

export type PeriodType = "annual" | "quarterly";

export type FieldKind = "money" | "perShare" | "shares" | "price";
export type Statement = "is" | "bs" | "cf" | "mkt";

export const FIELD_KEYS = [
  "revenue",
  "ebitda",
  "depreciation",
  "interest_expense",
  "pbt",
  "tax",
  "net_profit",
  "eps",
  "shares_outstanding_cr",
  "total_assets",
  "total_equity",
  "total_debt",
  "cash",
  "current_assets",
  "current_liabilities",
  "cfo",
  "capex",
  "cfi",
  "cff",
  "share_price",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export interface FieldDef {
  key: FieldKey;
  label: string;
  kind: FieldKind;
  statement: Statement;
  /** Short help shown in docs / import hints */
  help: string;
}

export const FIELD_DEFS: FieldDef[] = [
  { key: "revenue", label: "Revenue from operations", kind: "money", statement: "is", help: "Total revenue from operations (required)" },
  { key: "ebitda", label: "EBITDA", kind: "money", statement: "is", help: "Earnings before interest, tax, depreciation & amortisation" },
  { key: "depreciation", label: "Depreciation & amortisation", kind: "money", statement: "is", help: "Positive number" },
  { key: "interest_expense", label: "Finance costs", kind: "money", statement: "is", help: "Positive number" },
  { key: "pbt", label: "Profit before tax", kind: "money", statement: "is", help: "May be negative" },
  { key: "tax", label: "Tax expense", kind: "money", statement: "is", help: "Total tax expense (current + deferred)" },
  { key: "net_profit", label: "Net profit", kind: "money", statement: "is", help: "Profit after tax attributable to owners (required)" },
  { key: "eps", label: "EPS (₹)", kind: "perShare", statement: "is", help: "Basic EPS in INR per share" },
  { key: "shares_outstanding_cr", label: "Shares outstanding (crore)", kind: "shares", statement: "mkt", help: "Number of shares in crore (not affected by the unit column)" },
  { key: "total_assets", label: "Total assets", kind: "money", statement: "bs", help: "Balance-sheet date" },
  { key: "total_equity", label: "Total equity", kind: "money", statement: "bs", help: "Shareholders' equity" },
  { key: "total_debt", label: "Total borrowings", kind: "money", statement: "bs", help: "Short + long-term borrowings (exclude lease liabilities unless you want them counted)" },
  { key: "cash", label: "Cash & bank / liquid investments", kind: "money", statement: "bs", help: "Cash, bank balances and liquid investments" },
  { key: "current_assets", label: "Current assets", kind: "money", statement: "bs", help: "" },
  { key: "current_liabilities", label: "Current liabilities", kind: "money", statement: "bs", help: "" },
  { key: "cfo", label: "Cash flow from operations", kind: "money", statement: "cf", help: "Signed" },
  { key: "capex", label: "Capital expenditure", kind: "money", statement: "cf", help: "Enter as a POSITIVE number representing cash spent" },
  { key: "cfi", label: "Cash flow from investing", kind: "money", statement: "cf", help: "Signed" },
  { key: "cff", label: "Cash flow from financing", kind: "money", statement: "cf", help: "Signed" },
  { key: "share_price", label: "Share price (₹)", kind: "price", statement: "mkt", help: "A price snapshot you supply; the app never fetches quotes" },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;

export type Values = Record<FieldKey, number | null>;

export interface Period {
  /** "2026" for annual, "2026-Q3" for quarterly (fiscal year + quarter) */
  key: string;
  /** "FY26" or "Q3 FY26" */
  label: string;
  type: PeriodType;
  /** Fiscal year ending in March of this calendar year (Indian convention) */
  fy: number;
  quarter: number | null;
  /** ISO date YYYY-MM-DD */
  periodEnd: string;
  v: Values;
  restated: boolean;
  source: string;
  sourceUrl: string;
  /** ISO date the data was last verified by whoever supplied it ("" if unknown) */
  lastUpdated: string;
  priceDate: string;
  notes: string;
}

export interface Company {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  origin: "demo" | "upload";
  periods: Period[];
}

export type Severity = "error" | "warning" | "info";

export interface ImportIssue {
  severity: Severity;
  /** 1-based CSV line number (header = line 1). Undefined for file-level issues. */
  line?: number;
  column?: string;
  message: string;
}

export interface ImportStats {
  rows: number;
  companies: number;
  periods: number;
  byUnit: Record<string, number>;
  /** Count of blank/NA cells per optional numeric column */
  missing: Record<string, number>;
}

export interface ImportResult {
  ok: boolean;
  issues: ImportIssue[];
  companies: Company[];
  stats: ImportStats;
}
