"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_CSV } from "@/lib/demo-csv";
import { importCsv, mergeCompanies } from "@/lib/csv";
import { Company, PeriodType } from "@/lib/types";
import { computeMetrics, marketCap, mcapCategory, periodsOfType } from "@/lib/metrics";
import { DisplayUnit, UNIT_OPTIONS, fmtMoneyKpi } from "@/lib/format";
import { ValState, buildValuation, defaultValState } from "@/lib/valuation";
import { buildFinancialsCsv, buildValuationCsv, downloadText, safeFilename } from "@/lib/export";
import { Badge, Callout, EmptyState, Segmented, Skeleton, TabPanel, Tabs } from "./ui";
import { CompanySearch } from "./CompanySearch";
import { Provenance, computeFreshness } from "./Provenance";
import { Overview } from "./Overview";
import { Financials } from "./Financials";
import { ValuationPanel } from "./Valuation";
import { ImportPanel } from "./ImportPanel";
import { PrintSummary } from "./PrintSummary";

type MainTab = "overview" | "financials" | "valuation" | "data";
type Theme = "light" | "dark";

const LS_UPLOADS = "eli:v1:uploads";
const LS_PREFS = "eli:v1:prefs";
const LS_THEME = "eli-theme";

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function LoadingShell() {
  return (
    <div className="shell" aria-busy="true" aria-live="polite">
      <div className="topbar"><span className="brand">Equity Lens <span className="brand-sub">India</span></span></div>
      <main className="main">
        <Skeleton h={44} w="45%" />
        <div style={{ height: 16 }} />
        <Skeleton h={20} w="30%" />
        <div style={{ height: 24 }} />
        <div className="kpi-grid">
          {Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} h={110} />))}
        </div>
        <span className="sr-only">Loading dashboard…</span>
      </main>
    </div>
  );
}

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTab] = useState<MainTab>("overview");
  const [unit, setUnit] = useState<DisplayUnit>("crore");
  const [periodType, setPeriodType] = useState<PeriodType>("annual");
  const [selected, setSelected] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Company[]>([]);
  const [ranges, setRanges] = useState<Record<string, { from: string | null; to: string | null }>>({});
  const [valStates, setValStates] = useState<Record<string, ValState>>({});
  const [storageWarning, setStorageWarning] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  /* ---------- data ---------- */
  const demo = useMemo(() => importCsv(DEMO_CSV, { origin: "demo" }), []);
  const companies = useMemo(() => mergeCompanies(demo.companies, uploads), [demo.companies, uploads]);
  const company = useMemo(() => companies.find((c) => c.ticker === selected) ?? companies[0] ?? null, [companies, selected]);

  /* ---------- hydrate from browser storage (after mount, to avoid SSR mismatch) ---------- */
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setTheme(t);
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");

    try {
      const prefs = JSON.parse(lsGet(LS_PREFS) ?? "{}") as { unit?: DisplayUnit; periodType?: PeriodType };
      if (prefs.unit && UNIT_OPTIONS.some((u) => u.value === prefs.unit)) setUnit(prefs.unit);
      if (prefs.periodType === "annual" || prefs.periodType === "quarterly") setPeriodType(prefs.periodType);
    } catch {
      /* ignore corrupt prefs */
    }
    try {
      const raw = JSON.parse(lsGet(LS_UPLOADS) ?? "[]");
      if (Array.isArray(raw)) {
        let restored: Company[] = [];
        for (const csv of raw) {
          if (typeof csv !== "string") continue;
          const r = importCsv(csv, { origin: "upload" }); // re-validated, never trusted
          if (r.ok) restored = mergeCompanies(restored, r.companies);
        }
        if (restored.length) setUploads(restored);
      }
    } catch {
      /* ignore corrupt uploads */
    }
    setHydrated(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    lsSet(LS_PREFS, JSON.stringify({ unit, periodType }));
  }, [hydrated, unit, periodType]);

  useEffect(() => {
    if (!hydrated) return;
    const ok = lsSet(LS_UPLOADS, JSON.stringify(uploads.map((c) => buildFinancialsCsv(c))));
    setStorageWarning(!ok && uploads.length > 0);
  }, [hydrated, uploads]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    lsSet(LS_THEME, next);
  };

  /* ---------- derived: periods, range, metrics ---------- */
  const allPeriods = useMemo(() => (company ? periodsOfType(company, periodType) : []), [company, periodType]);
  const metricsAll = useMemo(() => computeMetrics(allPeriods, periodType), [allPeriods, periodType]);
  const rangeKey = company ? `${company.ticker}|${periodType}` : "";
  const range = ranges[rangeKey] ?? { from: null, to: null };
  const idxOf = (key: string | null, fallback: number) => {
    if (key === null) return fallback;
    const i = allPeriods.findIndex((p) => p.key === key);
    return i < 0 ? fallback : i;
  };
  let fromIdx = idxOf(range.from, 0);
  let toIdx = idxOf(range.to, allPeriods.length - 1);
  if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
  const periods = allPeriods.slice(fromIdx, toIdx + 1);
  const metrics = metricsAll.slice(fromIdx, toIdx + 1);
  const setRange = (patch: Partial<{ from: string | null; to: string | null }>) =>
    setRanges((r) => ({ ...r, [rangeKey]: { ...(r[rangeKey] ?? { from: null, to: null }), ...patch } }));
  const preset = (n: number | "all") =>
    setRanges((r) => ({
      ...r,
      [rangeKey]: { from: n === "all" ? null : allPeriods[Math.max(0, allPeriods.length - n)]?.key ?? null, to: null },
    }));

  /* ---------- valuation ---------- */
  const defaults = useMemo(() => (company ? defaultValState(company, companies) : null), [company, companies]);
  const valState: ValState | null = company && defaults ? valStates[company.ticker] ?? defaults.state : null;
  const updateVal = useCallback(
    (u: (s: ValState) => ValState) => {
      if (!company || !defaults) return;
      setValStates((prev) => ({ ...prev, [company.ticker]: u(prev[company.ticker] ?? defaults.state) }));
    },
    [company, defaults]
  );
  const resetVal = useCallback(() => {
    if (!company) return;
    setValStates((prev) => {
      const next = { ...prev };
      delete next[company.ticker];
      return next;
    });
  }, [company]);
  const valuation = useMemo(
    () => (company && valState ? buildValuation(company, companies, valState) : null),
    [company, companies, valState]
  );

  /* ---------- actions ---------- */
  const onImport = (incoming: Company[]) => {
    setUploads((u) => mergeCompanies(u, incoming));
    if (incoming[0]) setSelected(incoming[0].ticker);
  };
  const onRemove = (ticker: string) => {
    setUploads((u) => u.filter((c) => c.ticker !== ticker));
    setValStates((v) => {
      const n = { ...v };
      delete n[ticker];
      return n;
    });
  };
  const exportFinancials = () => {
    if (!company) return;
    downloadText(`${safeFilename(company.ticker)}_financials.csv`, buildFinancialsCsv(company));
  };
  const exportValuation = () => {
    if (!company || !valuation || !valState) return;
    downloadText(
      `${safeFilename(company.ticker)}_valuation.csv`,
      buildValuationCsv(company, valuation, valState, unit, company.origin === "demo" ? "SYNTHETIC DEMO DATA" : "user-uploaded CSV")
    );
  };

  if (!mounted) return <LoadingShell />;

  const cap = company ? marketCap(company) : null;
  const sourceLine = Array.from(new Set(periods.map((p) => p.source.trim() || "source not stated"))).join("; ") || "n/a";
  const fresh = company ? computeFreshness(company, periods, today) : null;
  const rangeOptions = allPeriods.map((p) => ({ key: p.key, label: p.label }));
  const presets = periodType === "annual" ? [3, 5] : [4, 8];

  return (
    <div className="shell">
      <a href="#main" className="skip">Skip to content</a>
      <div className="topbar no-print">
        <span className="brand">Equity Lens <span className="brand-sub">India</span></span>
        <span className="topbar-note">NSE · BSE listed companies · bring-your-own data</span>
        <button type="button" className="btn btn-quiet" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </div>

      <main id="main" className="main">
        {!demo.ok && <Callout tone="error" role="alert" title="The bundled demo dataset failed validation">{demo.issues.find((i) => i.severity === "error")?.message}</Callout>}
        {storageWarning && <Callout tone="warn" role="status" title="Uploads are not being saved">Your browser blocked or filled local storage, so uploaded companies will disappear when you close the tab. Export your financials as CSV to keep them.</Callout>}

        {!company ? (
          <EmptyState title="No companies loaded" action={<button className="btn btn-primary" onClick={() => setTab("data")}>Import a CSV</button>}>
            The demo dataset could not be loaded. Import your own CSV to begin.
          </EmptyState>
        ) : (
          <>
            <section className="hero no-print" aria-label="Company">
              <div className="hero-id">
                <p className="eyebrow">{company.sector}</p>
                <h1 className="company-name">{company.name}</h1>
                <p className="company-meta">
                  <span className="ticker">{company.ticker}</span> · {company.exchange}
                  {" "}
                  <Badge tone="neutral" title="Indicative bucket from fixed ₹-crore thresholds; official SEBI/AMFI classification is rank-based">{mcapCategory(cap)}</Badge>{" "}
                  {company.origin === "demo" ? <Badge tone="warn">Demo · synthetic</Badge> : <Badge tone="accent">Uploaded</Badge>}
                  {cap !== null && <span className="muted"> · Market cap snapshot {fmtMoneyKpi(cap, unit)}</span>}
                </p>
              </div>
              <div className="hero-tools">
                <CompanySearch companies={companies} selected={company.ticker} onSelect={setSelected} />
                <div className="row-gap wrap">
                  <button type="button" className="btn" onClick={exportFinancials}>Export financials CSV</button>
                  <button type="button" className="btn" onClick={exportValuation}>Export valuation CSV</button>
                  <button type="button" className="btn" onClick={() => window.print()}>Print summary</button>
                </div>
              </div>
            </section>

            <section className="controls no-print" aria-label="View controls">
              <div className="control">
                <span className="control-label" id="lbl-period">Reporting period</span>
                <Segmented label="Reporting period" value={periodType} onChange={setPeriodType} options={[{ value: "annual", label: "Annual" }, { value: "quarterly", label: "Quarterly" }]} />
              </div>
              <div className="control">
                <span className="control-label">Date range</span>
                <div className="row-gap">
                  <label className="sr-only" htmlFor="range-from">From</label>
                  <select id="range-from" value={allPeriods[fromIdx]?.key ?? ""} onChange={(e) => setRange({ from: e.target.value })} disabled={allPeriods.length === 0}>
                    {rangeOptions.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                  <span aria-hidden="true">→</span>
                  <label className="sr-only" htmlFor="range-to">To</label>
                  <select id="range-to" value={allPeriods[toIdx]?.key ?? ""} onChange={(e) => setRange({ to: e.target.value })} disabled={allPeriods.length === 0}>
                    {rangeOptions.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                  {presets.map((n) => (
                    <button key={n} type="button" className="btn btn-quiet btn-sm" disabled={allPeriods.length <= 1} onClick={() => preset(n)}>Last {n}</button>
                  ))}
                  <button type="button" className="btn btn-quiet btn-sm" disabled={allPeriods.length <= 1} onClick={() => preset("all")}>All</button>
                </div>
              </div>
              <div className="control">
                <span className="control-label">Display units</span>
                <Segmented label="Display units" value={unit} onChange={setUnit} options={UNIT_OPTIONS.map((u) => ({ value: u.value, label: u.label }))} />
              </div>
            </section>

            <div className="no-print">
              <Provenance company={company} periods={periods} periodType={periodType} today={today} />
            </div>

            <div className="no-print">
              <Tabs
                label="Sections"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "overview", label: "Overview" },
                  { value: "financials", label: "Financials" },
                  { value: "valuation", label: "Valuation" },
                  { value: "data", label: "Data & import" },
                ]}
              />

              {tab === "data" ? (
                <TabPanel id="data">
                  <ImportPanel companies={companies} onImport={onImport} onRemove={onRemove} />
                </TabPanel>
              ) : tab === "valuation" && valuation && valState && defaults ? (
                <TabPanel id="valuation">
                  <ValuationPanel company={company} state={valState} setState={updateVal} onReset={resetVal} notes={defaults.notes} valuation={valuation} unit={unit} />
                </TabPanel>
              ) : periods.length === 0 ? (
                <TabPanel id={tab}>
                  <EmptyState
                    title={`No ${periodType} data for ${company.name}`}
                    action={
                      <div className="row-gap">
                        <button className="btn" onClick={() => setPeriodType(periodType === "annual" ? "quarterly" : "annual")}>Switch to {periodType === "annual" ? "quarterly" : "annual"}</button>
                        <button className="btn btn-primary" onClick={() => setTab("data")}>Import data</button>
                      </div>
                    }
                  >
                    This company has no {periodType} rows in the loaded data. Try the other reporting period, or import a CSV that includes them.
                  </EmptyState>
                </TabPanel>
              ) : tab === "overview" ? (
                <TabPanel id="overview">
                  <Overview company={company} periods={periods} metrics={metrics} unit={unit} periodType={periodType} />
                </TabPanel>
              ) : (
                <TabPanel id="financials">
                  <Financials periods={periods} metrics={metrics} unit={unit} periodType={periodType} />
                </TabPanel>
              )}
            </div>

            {valuation && valState && (
              <PrintSummary
                company={company}
                periods={allPeriods.length ? periods : periodsOfType(company, "annual")}
                metrics={allPeriods.length ? metrics : computeMetrics(periodsOfType(company, "annual"), "annual")}
                periodType={allPeriods.length ? periodType : "annual"}
                unit={unit}
                valuation={valuation}
                state={valState}
                sourceLine={sourceLine}
                statusLine={fresh?.tone === "demo" ? "DEMO DATA – fictional company with synthetic numbers. Not real." : fresh?.text ?? ""}
              />
            )}
          </>
        )}
      </main>

      <footer className="footer no-print">
        <p>
          <strong>Equity Lens India</strong> is an analysis workbench, not a data vendor and not an adviser. It displays only the data you give it
          (plus a clearly-labelled synthetic demo set) and never fetches live quotes or filings. Valuation outputs depend on assumptions you choose
          and are not investment advice. Verify figures against primary filings on the NSE, BSE and company websites.
        </p>
      </footer>
    </div>
  );
}
