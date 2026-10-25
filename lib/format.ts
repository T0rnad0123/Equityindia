/** Display helpers using Indian conventions (₹, lakh/crore, 12,34,567 grouping). */

export type DisplayUnit = "crore" | "lakh" | "million";

export const UNIT_OPTIONS: { value: DisplayUnit; label: string; suffix: string; long: string }[] = [
  { value: "crore", label: "₹ crore", suffix: "Cr", long: "₹ crore" },
  { value: "lakh", label: "₹ lakh", suffix: "L", long: "₹ lakh" },
  { value: "million", label: "₹ million", suffix: "mn", long: "₹ million" },
];

/** Multiplier from the internal unit (INR crore) to the display unit. */
const FROM_CRORE: Record<DisplayUnit, number> = { crore: 1, lakh: 100, million: 10 };

export function toDisplay(valueCr: number | null | undefined, unit: DisplayUnit): number | null {
  if (valueCr === null || valueCr === undefined || !Number.isFinite(valueCr)) return null;
  return valueCr * FROM_CRORE[unit];
}

export function fromDisplay(value: number, unit: DisplayUnit): number {
  return value / FROM_CRORE[unit];
}

const nfIN = (d: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const nfUS = (d: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const DASH = "—";

export function fmtGrouped(n: number | null | undefined, decimals = 0, unit: DisplayUnit = "crore"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return (unit === "million" ? nfUS(decimals) : nfIN(decimals)).format(n);
}

/** Money given in INR crore, rendered in the chosen display unit without a symbol. */
export function fmtMoney(valueCr: number | null | undefined, unit: DisplayUnit, decimals?: number): string {
  const v = toDisplay(valueCr, unit);
  if (v === null) return DASH;
  const d = decimals ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 1 : 2);
  return fmtGrouped(v, d, unit);
}

/** KPI-style: "₹1,23,456 Cr", with "lakh Cr" for very large crore figures. */
export function fmtMoneyKpi(valueCr: number | null | undefined, unit: DisplayUnit): string {
  if (valueCr === null || valueCr === undefined || !Number.isFinite(valueCr)) return DASH;
  if (unit === "crore" && Math.abs(valueCr) >= 100000) {
    return `₹${fmtGrouped(valueCr / 100000, 2)} lakh Cr`;
  }
  const suffix = UNIT_OPTIONS.find((u) => u.value === unit)!.suffix;
  return `₹${fmtMoney(valueCr, unit)} ${suffix}`;
}

export function fmtPct(x: number | null | undefined, decimals = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return `${nfIN(decimals).format(x * 100)}%`;
}

export function fmtMult(x: number | null | undefined, decimals = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return `${nfIN(decimals).format(x)}×`;
}

export function fmtPrice(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return `₹${nfIN(2).format(x)}`;
}

export function fmtNum(x: number | null | undefined, decimals = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return nfIN(decimals).format(x);
}

/** 2026-03-31 -> "31 Mar 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${+m[3]} ${months[+m[2] - 1]} ${m[1]}`;
}

/** Whole months between two ISO dates (a <= b). */
export function monthsBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
}

/** Axis tick for charts (already in display units): plain Indian grouping, no abbreviations. */
export function fmtAxis(n: number): string {
  const a = Math.abs(n);
  return nfIN(a > 0 && a < 10 ? 1 : 0).format(n);
}
