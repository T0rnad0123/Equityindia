import {
  Company,
  FIELD_DEFS,
  FIELD_KEYS,
  FieldKey,
  ImportIssue,
  ImportResult,
  Period,
  PeriodType,
  Values,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

export const META_COLUMNS = [
  "ticker",
  "company_name",
  "exchange",
  "sector",
  "period_type",
  "fiscal_year",
  "quarter",
  "period_end",
  "currency",
  "unit",
] as const;

export const TRAILER_COLUMNS = ["price_date", "source", "source_url", "last_updated", "restated", "notes"] as const;

/** Canonical column order (used by exports and the sample file). */
export const ALL_COLUMNS: string[] = [...META_COLUMNS, ...FIELD_KEYS, ...TRAILER_COLUMNS];

export const REQUIRED_COLUMNS = [
  "ticker",
  "company_name",
  "exchange",
  "sector",
  "period_type",
  "fiscal_year",
  "period_end",
  "currency",
  "unit",
  "revenue",
  "net_profit",
] as const;

export const UNIT_FACTORS_TO_CRORE: Record<string, number> = {
  INR_CRORE: 1,
  INR_LAKH: 0.01,
  INR_MILLION: 0.1,
  INR: 1e-7,
};

const MONEY_KEYS = new Set<FieldKey>(FIELD_DEFS.filter((f) => f.kind === "money").map((f) => f.key));
const VALID_EXCHANGES = new Set(["NSE", "BSE", "NSE/BSE", "BSE/NSE", "NSE,BSE", "BSE,NSE"]);

/* -------------------------------------------------------------------------- */
/* Low-level CSV parsing (RFC 4180-ish: quotes, escaped quotes, CRLF, BOM)    */
/* -------------------------------------------------------------------------- */

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r") {
      i++;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Cell parsers                                                               */
/* -------------------------------------------------------------------------- */

const NULL_TOKENS = new Set(["", "na", "n/a", "nan", "null", "none", "-", "—", "–", "nm"]);

/** Returns {value:null} for blanks, {invalid:true} for junk. Accepts 1,23,456.7 and (123) negatives. */
export function parseNumber(raw: string): { value: number | null; invalid: boolean } {
  const t = raw.trim();
  if (NULL_TOKENS.has(t.toLowerCase())) return { value: null, invalid: false };
  let s = t.replace(/[₹\s]/g, "").replace(/^INR/i, "").replace(/,/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { value: null, invalid: true };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: neg ? -n : n, invalid: false };
}

/** Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY (Indian day-first). Returns ISO or null. */
export function parseDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (mt) {
    y = +mt[1];
    m = +mt[2];
    d = +mt[3];
  } else {
    mt = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
    if (!mt) return null;
    d = +mt[1];
    m = +mt[2];
    y = +mt[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

/** FY2026 | FY26 | 2026 | 2025-26 | FY2025-26  ->  2026 (the calendar year the fiscal year ends in) */
export function parseFiscalYear(raw: string): number | null {
  const t = raw.trim().toUpperCase().replace(/\s/g, "");
  let m = /^(?:FY)?(\d{4})$/.exec(t);
  if (m) return +m[1];
  m = /^FY(\d{2})$/.exec(t);
  if (m) return 2000 + +m[1];
  m = /^(?:FY)?(\d{4})[-/](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const start = +m[1];
    const end = m[2].length === 2 ? Math.floor(start / 100) * 100 + +m[2] : +m[2];
    if (end === start + 1) return end;
  }
  return null;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function periodLabel(type: PeriodType, fy: number, quarter: number | null): string {
  const yy = String(fy % 100).padStart(2, "0");
  return type === "annual" ? `FY${yy}` : `Q${quarter} FY${yy}`;
}

export function periodKey(type: PeriodType, fy: number, quarter: number | null): string {
  return type === "annual" ? String(fy) : `${fy}-Q${quarter}`;
}

function expectedPeriodEnd(type: PeriodType, fy: number, quarter: number | null): string {
  if (type === "annual") return `${fy}-03-31`;
  switch (quarter) {
    case 1: return `${fy - 1}-06-30`;
    case 2: return `${fy - 1}-09-30`;
    case 3: return `${fy - 1}-12-31`;
    default: return `${fy}-03-31`;
  }
}

export function emptyValues(): Values {
  const v = {} as Values;
  for (const k of FIELD_KEYS) v[k] = null;
  return v;
}

/* -------------------------------------------------------------------------- */
/* Import + validation                                                        */
/* -------------------------------------------------------------------------- */

const MAX_ROWS = 20000;

export function importCsv(text: string, opts?: { origin?: "demo" | "upload" }): ImportResult {
  const origin = opts?.origin ?? "upload";
  const issues: ImportIssue[] = [];
  const stats = { rows: 0, companies: 0, periods: 0, byUnit: {} as Record<string, number>, missing: {} as Record<string, number> };
  const fail = (): ImportResult => ({ ok: false, issues, companies: [], stats });

  if (!text || !text.trim()) {
    issues.push({ severity: "error", message: "The file is empty." });
    return fail();
  }

  let table: string[][];
  try {
    table = parseCsv(text);
  } catch {
    issues.push({ severity: "error", message: "The file could not be parsed as CSV." });
    return fail();
  }
  if (table.length < 2) {
    issues.push({ severity: "error", message: "The file needs a header row and at least one data row." });
    return fail();
  }
  if (table.length - 1 > MAX_ROWS) {
    issues.push({ severity: "error", message: `Too many rows (${table.length - 1}). The limit is ${MAX_ROWS}.` });
    return fail();
  }

  /* ---- header ---- */
  const header = table[0].map(normHeader);
  const index: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h in index) issues.push({ severity: "warning", line: 1, column: h, message: `Duplicate column "${h}" – the first occurrence is used.` });
    else index[h] = i;
  });

  const missingCols = REQUIRED_COLUMNS.filter((c) => !(c in index));
  if (missingCols.length) {
    issues.push({
      severity: "error",
      line: 1,
      message: `Missing required column${missingCols.length > 1 ? "s" : ""}: ${missingCols.join(", ")}. See the schema table for the full list.`,
    });
    return fail();
  }
  const known = new Set<string>(ALL_COLUMNS);
  for (const h of header) {
    if (h && !known.has(h)) issues.push({ severity: "info", line: 1, column: h, message: `Unknown column "${h}" is ignored.` });
  }
  const absentOptional = FIELD_KEYS.filter((k) => !(k in index));
  if (absentOptional.length) {
    issues.push({ severity: "info", message: `Optional columns not present (treated as missing): ${absentOptional.join(", ")}.` });
  }

  const get = (row: string[], col: string): string => {
    const i = index[col];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  /* ---- rows ---- */
  const companies = new Map<string, Company>();
  const seen = new Set<string>();
  const missingCount: Record<string, number> = {};
  for (const k of FIELD_KEYS) missingCount[k] = 0;
  let dataRows = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const line = r + 1;
    if (row.every((c) => !c.trim())) continue; // blank line
    dataRows++;
    const rowErrorsBefore = issues.filter((i) => i.severity === "error").length;
    const err = (column: string, message: string) => issues.push({ severity: "error", line, column, message });
    const warn = (column: string, message: string) => issues.push({ severity: "warning", line, column, message });

    const ticker = get(row, "ticker").toUpperCase();
    const name = get(row, "company_name");
    const exchange = get(row, "exchange").toUpperCase();
    const sector = get(row, "sector");
    if (!ticker) err("ticker", "Ticker is required.");
    if (!name) err("company_name", "Company name is required.");
    if (!sector) err("sector", "Sector is required (used for peer matching).");
    if (!VALID_EXCHANGES.has(exchange)) err("exchange", `Exchange "${get(row, "exchange")}" is not recognised. Use NSE, BSE or NSE/BSE.`);

    const ptRaw = get(row, "period_type").toLowerCase();
    const type: PeriodType | null = ptRaw === "annual" || ptRaw === "quarterly" ? ptRaw : null;
    if (!type) err("period_type", `period_type must be "annual" or "quarterly" (got "${get(row, "period_type")}").`);

    const fy = parseFiscalYear(get(row, "fiscal_year"));
    if (fy === null) err("fiscal_year", `fiscal_year "${get(row, "fiscal_year")}" is not valid. Use e.g. FY2026 (year ending 31 Mar 2026).`);

    let quarter: number | null = null;
    if (type === "quarterly") {
      const q = /^Q?([1-4])$/i.exec(get(row, "quarter"));
      if (!q) err("quarter", "Quarterly rows need quarter = Q1, Q2, Q3 or Q4 (fiscal quarter, Q1 = Apr–Jun).");
      else quarter = +q[1];
    }

    const periodEnd = parseDate(get(row, "period_end"));
    if (!periodEnd) err("period_end", `period_end "${get(row, "period_end")}" is not a valid date. Use YYYY-MM-DD.`);

    const currency = get(row, "currency").toUpperCase();
    if (currency !== "INR") err("currency", `Only INR is supported (got "${get(row, "currency")}").`);

    const unit = get(row, "unit").toUpperCase();
    const factor = UNIT_FACTORS_TO_CRORE[unit];
    if (factor === undefined) err("unit", `Unit "${get(row, "unit")}" is not supported. Use one of: ${Object.keys(UNIT_FACTORS_TO_CRORE).join(", ")}.`);
    else stats.byUnit[unit] = (stats.byUnit[unit] ?? 0) + 1;

    if (type && fy !== null && periodEnd && (type === "annual" || quarter !== null)) {
      const exp = expectedPeriodEnd(type, fy, quarter);
      if (exp !== periodEnd) {
        warn("period_end", `period_end ${periodEnd} differs from the Indian fiscal calendar (${exp}) for ${periodLabel(type, fy, quarter)}. Fine for non-March year-ends; otherwise check the fiscal_year.`);
      }
    }

    const v = emptyValues();
    for (const f of FIELD_DEFS) {
      if (!(f.key in index)) {
        missingCount[f.key]++;
        continue;
      }
      const raw = get(row, f.key);
      const parsed = parseNumber(raw);
      if (parsed.invalid) {
        err(f.key, `"${raw}" is not a number. Use plain numbers (commas allowed); leave blank if not available.`);
        continue;
      }
      if (parsed.value === null) {
        missingCount[f.key]++;
        if (f.key === "revenue" || f.key === "net_profit") err(f.key, `${f.label} is required but blank.`);
        continue;
      }
      v[f.key] = MONEY_KEYS.has(f.key) && factor !== undefined ? parsed.value * factor : parsed.value;
    }

    /* plausibility checks */
    if (v.revenue !== null && v.revenue < 0) err("revenue", "Revenue cannot be negative.");
    if (v.total_debt !== null && v.total_debt < 0) err("total_debt", "Total borrowings cannot be negative.");
    if (v.cash !== null && v.cash < 0) err("cash", "Cash cannot be negative.");
    if (v.shares_outstanding_cr !== null && v.shares_outstanding_cr <= 0) err("shares_outstanding_cr", "Shares outstanding must be positive.");
    if (v.share_price !== null && v.share_price <= 0) err("share_price", "Share price must be positive.");
    if (v.capex !== null && v.capex < 0) warn("capex", "Capex is negative. Enter capex as a POSITIVE number (cash spent); the sign has been flipped for you.");
    if (v.capex !== null && v.capex < 0) v.capex = Math.abs(v.capex);
    if (v.revenue !== null && v.ebitda !== null && v.revenue > 0 && v.ebitda > v.revenue) warn("ebitda", "EBITDA exceeds revenue – check units or columns.");
    if (v.revenue !== null && v.net_profit !== null && v.revenue > 0 && Math.abs(v.net_profit) > v.revenue * 1.5) warn("net_profit", "Net profit is more than 1.5× revenue – check units.");
    if (v.total_equity !== null && v.total_assets !== null && v.total_equity > v.total_assets * 1.001) warn("total_equity", "Equity exceeds total assets – check the balance-sheet columns.");
    if (v.cash !== null && v.total_assets !== null && v.cash > v.total_assets * 1.001) warn("cash", "Cash exceeds total assets – check the balance-sheet columns.");
    if (v.eps !== null && v.net_profit !== null && v.shares_outstanding_cr && v.eps !== 0) {
      const implied = v.net_profit / v.shares_outstanding_cr;
      if (Math.abs(implied - v.eps) / Math.abs(v.eps) > 0.25) {
        warn("eps", `EPS ₹${v.eps.toFixed(2)} differs from net profit ÷ shares (₹${implied.toFixed(2)}) by >25%. This usually means a unit mismatch, a share-count change, or a different profit measure.`);
      }
    }

    const restatedRaw = get(row, "restated").toLowerCase();
    const restated = ["true", "yes", "y", "1", "restated"].includes(restatedRaw);
    if (restatedRaw && !restated && !["false", "no", "n", "0"].includes(restatedRaw)) warn("restated", `restated "${restatedRaw}" not recognised – treated as false. Use true/false.`);

    const lastUpdatedRaw = get(row, "last_updated");
    const lastUpdated = lastUpdatedRaw ? parseDate(lastUpdatedRaw) : "";
    if (lastUpdatedRaw && !lastUpdated) warn("last_updated", `last_updated "${lastUpdatedRaw}" is not a valid date – ignored.`);
    const priceDateRaw = get(row, "price_date");
    const priceDate = priceDateRaw ? parseDate(priceDateRaw) : "";
    if (priceDateRaw && !priceDate) warn("price_date", `price_date "${priceDateRaw}" is not a valid date – ignored.`);
    if (v.share_price !== null && !priceDate) warn("price_date", "A share price is given without price_date; the app will show the price as undated.");

    const source = get(row, "source");
    if (!source) warn("source", "No source given. The UI will label this period 'source not stated'.");
    const sourceUrl = get(row, "source_url");
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) warn("source_url", "source_url should start with http:// or https:// – it will not be rendered as a link.");

    const rowHadErrors = issues.filter((i) => i.severity === "error").length > rowErrorsBefore;
    if (rowHadErrors || !type || fy === null || !periodEnd) continue;
    if (type === "quarterly" && quarter === null) continue;

    const key = periodKey(type, fy, quarter);
    const dupKey = `${ticker}|${key}`;
    if (seen.has(dupKey)) {
      err("fiscal_year", `Duplicate row for ${ticker} ${periodLabel(type, fy, quarter)}. Each company/period may appear once.`);
      continue;
    }
    seen.add(dupKey);

    let c = companies.get(ticker);
    if (!c) {
      c = { ticker, name, exchange: exchange === "BSE,NSE" || exchange === "BSE/NSE" || exchange === "NSE,BSE" ? "NSE/BSE" : exchange, sector, origin, periods: [] };
      companies.set(ticker, c);
    } else {
      if (c.name !== name) warn("company_name", `Name "${name}" differs from earlier rows for ${ticker} ("${c.name}"); using the first.`);
      if (c.sector !== sector) warn("sector", `Sector "${sector}" differs from earlier rows for ${ticker} ("${c.sector}"); using the first.`);
    }
    const period: Period = {
      key,
      label: periodLabel(type, fy, quarter),
      type,
      fy,
      quarter,
      periodEnd,
      v,
      restated,
      source,
      sourceUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : "",
      lastUpdated: lastUpdated ?? "",
      priceDate: priceDate ?? "",
      notes: get(row, "notes"),
    };
    c.periods.push(period);
  }

  stats.rows = dataRows;
  if (dataRows === 0) issues.push({ severity: "error", message: "No data rows found below the header." });

  /* ---- cross-period checks ---- */
  for (const c of companies.values()) {
    c.periods.sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));
    for (const t of ["annual", "quarterly"] as PeriodType[]) {
      const ps = c.periods.filter((p) => p.type === t);
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1].v.revenue;
        const b = ps[i].v.revenue;
        if (a && b && a > 0 && b > 0 && (b / a > 50 || a / b > 50)) {
          issues.push({
            severity: "warning",
            column: "revenue",
            message: `${c.ticker}: revenue changes ${(b / a).toFixed(1)}× between ${ps[i - 1].label} and ${ps[i].label} – possible unit mix-up (e.g. lakh vs crore).`,
          });
        }
      }
      // gaps in annual series
      if (t === "annual") {
        for (let i = 1; i < ps.length; i++) {
          if (ps[i].fy - ps[i - 1].fy > 1) {
            issues.push({ severity: "info", message: `${c.ticker}: no annual data between ${ps[i - 1].label} and ${ps[i].label}. Charts will show a gap.` });
          }
        }
      }
    }
    if (c.periods.length === 1) issues.push({ severity: "info", message: `${c.ticker}: only one period supplied – growth rates and trends will not be available.` });
  }

  stats.companies = companies.size;
  stats.periods = Array.from(companies.values()).reduce((s, c) => s + c.periods.length, 0);
  stats.missing = Object.fromEntries(Object.entries(missingCount).filter(([, n]) => n > 0));

  const hasErrors = issues.some((i) => i.severity === "error");
  return { ok: !hasErrors && companies.size > 0, issues, companies: hasErrors ? [] : Array.from(companies.values()), stats };
}

/* -------------------------------------------------------------------------- */
/* Merging                                                                    */
/* -------------------------------------------------------------------------- */

/** Incoming periods replace existing periods with the same key; everything else is kept. */
export function mergeCompanies(base: Company[], incoming: Company[]): Company[] {
  const map = new Map(base.map((c) => [c.ticker, { ...c, periods: [...c.periods] }]));
  for (const inc of incoming) {
    const cur = map.get(inc.ticker);
    if (!cur) {
      map.set(inc.ticker, inc);
      continue;
    }
    const byKey = new Map(cur.periods.map((p) => [`${p.type}|${p.key}`, p]));
    for (const p of inc.periods) byKey.set(`${p.type}|${p.key}`, p);
    const periods = Array.from(byKey.values()).sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
    map.set(inc.ticker, { ...inc, periods });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------------------- */
/* Serialisation (export)                                                     */
/* -------------------------------------------------------------------------- */

export function csvEscape(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  let s = typeof cell === "number" ? String(cell) : cell;
  // Neutralise spreadsheet formula injection for text cells.
  if (typeof cell === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

/** Company -> rows in the import schema (always INR_CRORE). Round-trips through importCsv. */
export function companyToImportRows(c: Company): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [ALL_COLUMNS];
  for (const p of c.periods) {
    const byCol: Record<string, string | number | null> = {
      ticker: c.ticker,
      company_name: c.name,
      exchange: c.exchange,
      sector: c.sector,
      period_type: p.type,
      fiscal_year: `FY${p.fy}`,
      quarter: p.quarter ? `Q${p.quarter}` : "",
      period_end: p.periodEnd,
      currency: "INR",
      unit: "INR_CRORE",
      price_date: p.priceDate,
      source: p.source,
      source_url: p.sourceUrl,
      last_updated: p.lastUpdated,
      restated: p.restated ? "true" : "false",
      notes: p.notes,
    };
    for (const k of FIELD_KEYS) byCol[k] = p.v[k];
    rows.push(ALL_COLUMNS.map((col) => byCol[col] ?? ""));
  }
  return rows;
}
