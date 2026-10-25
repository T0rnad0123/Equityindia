"use client";

import React from "react";
import { Company, Period, PeriodType } from "@/lib/types";
import { PeriodMetrics, marketCap, mcapCategory, qualityReport } from "@/lib/metrics";
import { DisplayUnit, DASH, fmtMoneyKpi, fmtMult, fmtPct, fmtPrice, toDisplay, fmtGrouped } from "@/lib/format";
import { Badge, Card } from "./ui";
import { ChartRow, Spark, TrendChart } from "./charts";

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="delta delta-na" title="Not available (missing data or non-positive base)">n/a</span>;
  const up = value >= 0;
  return (
    <span className={up ? "delta delta-up" : "delta delta-down"}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span> {fmtPct(Math.abs(value))} <span className="delta-label">{label}</span>
    </span>
  );
}

function Kpi({ label, value, delta, deltaLabel, spark, sub }: { label: string; value: string; delta?: number | null; deltaLabel?: string; spark?: (number | null)[]; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {delta !== undefined ? <Delta value={delta} label={deltaLabel ?? ""} /> : <span className="muted">{sub}</span>}
      </div>
      {spark && <Spark values={spark} label={`${label} trend`} />}
    </div>
  );
}

const pctChange = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev <= 0 ? null : cur / prev - 1;

export function Overview({
  company,
  periods,
  metrics,
  unit,
  periodType,
}: {
  company: Company;
  periods: Period[];
  metrics: PeriodMetrics[];
  unit: DisplayUnit;
  periodType: PeriodType;
}) {
  const i = periods.length - 1;
  const p = periods[i];
  const m = metrics[i];
  const prev = i > 0 ? periods[i - 1] : undefined;
  const cap = marketCap(company);
  const yoy = periodType === "annual" ? "YoY" : "YoY (same quarter)";
  const seq = "vs prior period";

  const rows: ChartRow[] = periods.map((x, k) => ({
    label: x.restated ? `${x.label} (R)` : x.label,
    revenue: toDisplay(x.v.revenue, unit),
    ebitda: toDisplay(x.v.ebitda, unit),
    net_profit: toDisplay(x.v.net_profit, unit),
    ebitdaMargin: metrics[k].ebitdaMargin,
    ebitMargin: metrics[k].ebitMargin,
    netMargin: metrics[k].netMargin,
  }));
  const unitLabel = unit === "crore" ? "₹ crore" : unit === "lakh" ? "₹ lakh" : "₹ million";
  const q = qualityReport(periods, periodType).filter((r) => r.missing.length > 0);

  const sp = (f: (x: Period) => number | null) => periods.map((x) => toDisplay(f(x), unit));

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label={`Revenue · ${p.label}`} value={fmtMoneyKpi(p.v.revenue, unit)} delta={m.revenueGrowth} deltaLabel={yoy} spark={sp((x) => x.v.revenue)} />
        <Kpi label="EBITDA" value={fmtMoneyKpi(p.v.ebitda, unit)} delta={m.ebitdaGrowth} deltaLabel={yoy} spark={sp((x) => x.v.ebitda)} />
        <Kpi label="Net profit" value={fmtMoneyKpi(p.v.net_profit, unit)} delta={m.netProfitGrowth} deltaLabel={yoy} spark={sp((x) => x.v.net_profit)} />
        <Kpi label="EPS (basic)" value={fmtPrice(m.eps)} delta={m.epsGrowth} deltaLabel={yoy} spark={periods.map((x, k) => metrics[k].eps ?? null)} />
        <Kpi label="Total borrowings" value={fmtMoneyKpi(p.v.total_debt, unit)} delta={prev ? pctChange(p.v.total_debt, prev.v.total_debt) : null} deltaLabel={seq} />
        <Kpi label="Cash & liquid investments" value={fmtMoneyKpi(p.v.cash, unit)} delta={prev ? pctChange(p.v.cash, prev.v.cash) : null} deltaLabel={seq} />
        <Kpi label="Net debt" value={fmtMoneyKpi(m.netDebt, unit)} sub={m.netDebt !== null && m.netDebt < 0 ? "Net cash position" : m.netDebt === null ? "Needs borrowings and cash" : "Net borrower"} />
        <Kpi label="Market cap (snapshot)" value={fmtMoneyKpi(cap, unit)} sub={`${mcapCategory(cap)} · indicative`} />
      </div>

      <div className="grid-2">
        <Card title="Scale and profit" subtitle={`${unitLabel} · ${periodType}`}>
          <TrendChart
            title="Revenue, EBITDA and net profit"
            data={rows}
            series={[
              { key: "revenue", name: "Revenue", color: "var(--s1)", type: "bar" },
              { key: "ebitda", name: "EBITDA", color: "var(--s2)", type: "line" },
              { key: "net_profit", name: "Net profit", color: "var(--s3)", type: "line" },
            ]}
            format={(n) => fmtGrouped(n, Math.abs(n) >= 100 ? 0 : 1, unit)}
            suffix=""
          />
        </Card>
        <Card title="Profitability" subtitle="Margins as % of revenue">
          <TrendChart
            title="EBITDA, EBIT and net margin"
            data={rows}
            series={[
              { key: "ebitdaMargin", name: "EBITDA margin", color: "var(--s1)", type: "line" },
              { key: "ebitMargin", name: "EBIT margin", color: "var(--s2)", type: "line" },
              { key: "netMargin", name: "Net margin", color: "var(--s3)", type: "line" },
            ]}
            format={(n) => fmtPct(n)}
            axisFormat={(n) => `${Math.round(n * 100)}%`}
          />
        </Card>
      </div>

      <Card title="Operating and balance-sheet metrics" subtitle={`As of ${p.label}${periodType === "quarterly" ? " · returns and leverage ratios need annual data" : ""}`}>
        <dl className="metric-grid">
          <Metric label="EBITDA margin" v={fmtPct(m.ebitdaMargin)} />
          <Metric label="Net margin" v={fmtPct(m.netMargin)} />
          <Metric label="ROE" v={fmtPct(m.roe)} hint="Net profit ÷ average equity" />
          <Metric label="ROCE" v={fmtPct(m.roce)} hint="EBIT ÷ (total assets − current liabilities)" />
          <Metric label="Debt / equity" v={fmtMult(m.debtToEquity, 2)} />
          <Metric label="Net debt / EBITDA" v={fmtMult(m.netDebtToEbitda, 2)} />
          <Metric label="Interest cover" v={fmtMult(m.interestCoverage, 1)} hint="EBIT ÷ finance costs" />
          <Metric label="Current ratio" v={fmtMult(m.currentRatio, 2)} />
          <Metric label="Free cash flow" v={m.fcf === null ? DASH : fmtMoneyKpi(m.fcf, unit)} hint="CFO − capex" />
          <Metric label="Cash conversion" v={fmtPct(m.cashConversion, 0)} hint="CFO ÷ EBITDA" />
          <Metric label="Asset turnover" v={fmtMult(m.assetTurnover, 2)} />
          <Metric label="Effective tax rate" v={fmtPct(m.effectiveTaxRate)} />
        </dl>
      </Card>

      <Card title="Data completeness" subtitle="Items missing in the selected range are shown as “—” everywhere and are never estimated.">
        {q.length === 0 ? (
          <p className="muted">All core line items are present for every period in range.</p>
        ) : (
          <details>
            <summary>{q.length} of {periods.length} periods have missing items</summary>
            <table className="table table-compact">
              <thead><tr><th>Period</th><th>Missing line items</th></tr></thead>
              <tbody>
                {q.map((r) => (
                  <tr key={r.period.key}>
                    <th scope="row">{r.period.label}{r.period.restated && <> <Badge tone="warn" title="Restated period">R</Badge></>}</th>
                    <td>{r.missing.map((k) => k.replace(/_/g, " ")).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, v, hint }: { label: string; v: string; hint?: string }) {
  return (
    <div className="metric" title={hint}>
      <dt>{label}</dt>
      <dd>{v}</dd>
    </div>
  );
}

