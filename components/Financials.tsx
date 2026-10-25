"use client";

import React, { useState } from "react";
import { Period, PeriodType } from "@/lib/types";
import { PeriodMetrics, cagr, fcfOf } from "@/lib/metrics";
import { DASH, DisplayUnit, fmtGrouped, fmtMoney, fmtMult, fmtPct, fmtPrice, toDisplay } from "@/lib/format";
import { Badge, Callout, Card, Segmented } from "./ui";
import { ChartRow, TrendChart } from "./charts";

type Fmt = "money" | "pct" | "x" | "price";

interface RowSpec {
  label: string;
  get: (p: Period, m: PeriodMetrics) => number | null;
  fmt: Fmt;
  derived?: boolean;
  sub?: boolean; // indented ratio row
  strong?: boolean;
}

const IS_ROWS: RowSpec[] = [
  { label: "Revenue from operations", get: (p) => p.v.revenue, fmt: "money", strong: true },
  { label: "growth", get: (_, m) => m.revenueGrowth, fmt: "pct", sub: true },
  { label: "EBITDA", get: (p) => p.v.ebitda, fmt: "money", strong: true },
  { label: "margin", get: (_, m) => m.ebitdaMargin, fmt: "pct", sub: true },
  { label: "Depreciation & amortisation", get: (p) => p.v.depreciation, fmt: "money" },
  { label: "EBIT (EBITDA − D&A)", get: (_, m) => m.ebit, fmt: "money", derived: true },
  { label: "Finance costs", get: (p) => p.v.interest_expense, fmt: "money" },
  { label: "Profit before tax", get: (p) => p.v.pbt, fmt: "money" },
  { label: "Tax expense", get: (p) => p.v.tax, fmt: "money" },
  { label: "Net profit", get: (p) => p.v.net_profit, fmt: "money", strong: true },
  { label: "growth", get: (_, m) => m.netProfitGrowth, fmt: "pct", sub: true },
  { label: "margin", get: (_, m) => m.netMargin, fmt: "pct", sub: true },
  { label: "EPS (₹)", get: (_, m) => m.eps, fmt: "price", strong: true },
  { label: "growth", get: (_, m) => m.epsGrowth, fmt: "pct", sub: true },
];

const BS_ROWS: RowSpec[] = [
  { label: "Total assets", get: (p) => p.v.total_assets, fmt: "money", strong: true },
  { label: "Total equity", get: (p) => p.v.total_equity, fmt: "money", strong: true },
  { label: "Total borrowings", get: (p) => p.v.total_debt, fmt: "money" },
  { label: "Cash & liquid investments", get: (p) => p.v.cash, fmt: "money" },
  { label: "Net debt (borrowings − cash)", get: (_, m) => m.netDebt, fmt: "money", derived: true },
  { label: "Current assets", get: (p) => p.v.current_assets, fmt: "money" },
  { label: "Current liabilities", get: (p) => p.v.current_liabilities, fmt: "money" },
];

const CF_ROWS: RowSpec[] = [
  { label: "Cash flow from operations", get: (p) => p.v.cfo, fmt: "money", strong: true },
  { label: "Capital expenditure", get: (p) => p.v.capex, fmt: "money" },
  { label: "Free cash flow (CFO − capex)", get: (_, m) => m.fcf, fmt: "money", derived: true, strong: true },
  { label: "Cash flow from investing", get: (p) => p.v.cfi, fmt: "money" },
  { label: "Cash flow from financing", get: (p) => p.v.cff, fmt: "money" },
];

const RATIO_ROWS: RowSpec[] = [
  { label: "Revenue growth", get: (_, m) => m.revenueGrowth, fmt: "pct" },
  { label: "EBITDA growth", get: (_, m) => m.ebitdaGrowth, fmt: "pct" },
  { label: "Net profit growth", get: (_, m) => m.netProfitGrowth, fmt: "pct" },
  { label: "EPS growth", get: (_, m) => m.epsGrowth, fmt: "pct" },
  { label: "EBITDA margin", get: (_, m) => m.ebitdaMargin, fmt: "pct" },
  { label: "EBIT margin", get: (_, m) => m.ebitMargin, fmt: "pct" },
  { label: "Net margin", get: (_, m) => m.netMargin, fmt: "pct" },
  { label: "Return on equity", get: (_, m) => m.roe, fmt: "pct" },
  { label: "Return on capital employed", get: (_, m) => m.roce, fmt: "pct" },
  { label: "Debt / equity", get: (_, m) => m.debtToEquity, fmt: "x" },
  { label: "Net debt / EBITDA", get: (_, m) => m.netDebtToEbitda, fmt: "x" },
  { label: "Interest coverage (EBIT ÷ finance costs)", get: (_, m) => m.interestCoverage, fmt: "x" },
  { label: "Current ratio", get: (_, m) => m.currentRatio, fmt: "x" },
  { label: "FCF margin", get: (_, m) => m.fcfMargin, fmt: "pct" },
  { label: "Cash conversion (CFO ÷ EBITDA)", get: (_, m) => m.cashConversion, fmt: "pct" },
  { label: "Asset turnover", get: (_, m) => m.assetTurnover, fmt: "x" },
  { label: "Effective tax rate", get: (_, m) => m.effectiveTaxRate, fmt: "pct" },
];

function cell(v: number | null, fmt: Fmt, unit: DisplayUnit): string {
  if (v === null) return DASH;
  switch (fmt) {
    case "money": return fmtMoney(v, unit);
    case "pct": return fmtPct(v);
    case "x": return fmtMult(v, 2);
    case "price": return fmtPrice(v).replace("₹", "");
  }
}

function StatementTable({
  rows,
  periods,
  metrics,
  unit,
  caption,
}: {
  rows: RowSpec[];
  periods: Period[];
  metrics: PeriodMetrics[];
  unit: DisplayUnit;
  caption: string;
}) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="table fin">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky-col">Line item</th>
            {periods.map((p) => (
              <th scope="col" key={p.key} className="num">
                {p.label}
                {p.restated && <> <Badge tone="warn" title="Restated – not strictly comparable with earlier periods">R</Badge></>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={r.sub ? "sub" : r.strong ? "strong" : ""}>
              <th scope="row" className="sticky-col">
                {r.sub ? <span className="indent">{r.label}</span> : r.label}
                {r.derived && <span className="tag" title="Calculated by the app from reported items">derived</span>}
              </th>
              {periods.map((p, i) => {
                const val = r.get(p, metrics[i]);
                return (
                  <td key={p.key} className={val === null ? "num na" : val < 0 && r.fmt === "money" ? "num neg" : "num"} title={val === null ? "Not provided in source, or not computable" : undefined}>
                    {cell(val, r.fmt, unit)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Financials({
  periods,
  metrics,
  unit,
  periodType,
}: {
  periods: Period[];
  metrics: PeriodMetrics[];
  unit: DisplayUnit;
  periodType: PeriodType;
}) {
  const [stmt, setStmt] = useState<"is" | "bs" | "cf" | "ratios">("is");
  const unitLabel = unit === "crore" ? "₹ crore" : unit === "lakh" ? "₹ lakh" : "₹ million";
  const moneyFmt = (n: number) => fmtGrouped(n, Math.abs(n) >= 100 ? 0 : 1, unit);
  const label = (p: Period) => (p.restated ? `${p.label} (R)` : p.label);

  const money = (f: (p: Period, m: PeriodMetrics) => number | null): ((p: Period, m: PeriodMetrics) => number | null) => (p, m) => toDisplay(f(p, m), unit);
  const mk = (fields: Record<string, (p: Period, m: PeriodMetrics) => number | null>): ChartRow[] =>
    periods.map((p, i) => {
      const row: ChartRow = { label: label(p) };
      for (const [k, f] of Object.entries(fields)) row[k] = f(p, metrics[i]);
      return row;
    });

  const incomeRows = mk({
    revenue: money((p) => p.v.revenue),
    ebitda: money((p) => p.v.ebitda),
    np: money((p) => p.v.net_profit),
  });
  const epsRows = mk({ eps: (_, m) => m.eps });
  const cfRows = mk({
    cfo: money((p) => p.v.cfo),
    capex: money((p) => (p.v.capex === null ? null : Math.abs(p.v.capex))),
    fcf: money((p) => fcfOf(p)),
  });
  const debtRows = mk({
    debt: money((p) => p.v.total_debt),
    cash: money((p) => p.v.cash),
    net: money((_, m) => m.netDebt),
  });
  const levRows = mk({ de: (_, m) => m.debtToEquity, nde: (_, m) => m.netDebtToEbitda });
  const retRows = mk({ roe: (_, m) => m.roe, roce: (_, m) => m.roce });
  const marginRows = mk({ e: (_, m) => m.ebitdaMargin, n: (_, m) => m.netMargin, f: (_, m) => m.fcfMargin });

  const first = periods[0];
  const last = periods[periods.length - 1];
  const spanYears = first && last && periodType === "annual" ? last.fy - first.fy : 0;
  const revCagr = cagr(first?.v.revenue ?? null, last?.v.revenue ?? null, spanYears);
  const npCagr = cagr(first?.v.net_profit ?? null, last?.v.net_profit ?? null, spanYears);
  const epsCagr = first && last ? cagr(metrics[0].eps, metrics[metrics.length - 1].eps, spanYears) : null;
  const hasBS = periods.some((p) => p.v.total_assets !== null || p.v.total_equity !== null);
  const hasCF = periods.some((p) => p.v.cfo !== null);

  return (
    <div className="stack">
      {periods.length < 2 && <Callout tone="info" title="Only one period in range">Trends and growth rates need at least two periods. Widen the date range or import more history.</Callout>}
      {periodType === "quarterly" && (
        <Callout tone="info" title="Quarterly view">
          Balance-sheet and cash-flow items are typically disclosed half-yearly or yearly, so they may be blank here. Return ratios and leverage multiples are only computed on annual data (quarterly figures are not annualised).
        </Callout>
      )}

      {periodType === "annual" && periods.length > 1 && (
        <div className="cagr-strip" aria-label="Compound annual growth over the selected range">
          <span>CAGR {first.label} → {last.label}</span>
          <strong>Revenue {fmtPct(revCagr)}</strong>
          <strong>Net profit {fmtPct(npCagr)}</strong>
          <strong>EPS {fmtPct(epsCagr)}</strong>
          <span className="muted">“—” when the start or end value is not positive.</span>
        </div>
      )}

      <div className="grid-2">
        <Card title="Revenue and earnings" subtitle={unitLabel}>
          <TrendChart
            title="Revenue, EBITDA and net profit"
            data={incomeRows}
            series={[
              { key: "revenue", name: "Revenue", color: "var(--s1)", type: "bar" },
              { key: "ebitda", name: "EBITDA", color: "var(--s2)", type: "line" },
              { key: "np", name: "Net profit", color: "var(--s3)", type: "line" },
            ]}
            format={moneyFmt}
          />
        </Card>
        <Card title="Earnings per share" subtitle="₹ per share">
          <TrendChart title="Basic EPS" data={epsRows} series={[{ key: "eps", name: "EPS (₹)", color: "var(--s1)", type: "bar" }]} format={(n) => fmtPrice(n)} axisFormat={(n) => `₹${fmtGrouped(n, 0)}`} />
        </Card>
        <Card title="Margins" subtitle="% of revenue">
          <TrendChart
            title="EBITDA, net and free-cash-flow margin"
            data={marginRows}
            series={[
              { key: "e", name: "EBITDA margin", color: "var(--s1)", type: "line" },
              { key: "n", name: "Net margin", color: "var(--s3)", type: "line" },
              { key: "f", name: "FCF margin", color: "var(--s2)", type: "line" },
            ]}
            format={(n) => fmtPct(n)}
            axisFormat={(n) => `${Math.round(n * 100)}%`}
          />
        </Card>
        <Card title="Cash flow" subtitle={unitLabel}>
          {hasCF ? (
            <TrendChart
              title="Operating cash flow, capex and free cash flow"
              data={cfRows}
              series={[
                { key: "cfo", name: "Operating cash flow", color: "var(--s1)", type: "bar" },
                { key: "capex", name: "Capex", color: "var(--s2)", type: "bar" },
                { key: "fcf", name: "Free cash flow", color: "var(--s3)", type: "bar" },
              ]}
              format={moneyFmt}
            />
          ) : (
            <div className="chart-empty">No cash-flow data in this range.</div>
          )}
        </Card>
        <Card title="Debt and cash" subtitle={unitLabel}>
          {hasBS ? (
            <TrendChart
              title="Borrowings, cash and net debt"
              data={debtRows}
              series={[
                { key: "debt", name: "Borrowings", color: "var(--s1)", type: "bar" },
                { key: "cash", name: "Cash", color: "var(--s3)", type: "bar" },
                { key: "net", name: "Net debt", color: "var(--s2)", type: "line" },
              ]}
              format={moneyFmt}
            />
          ) : (
            <div className="chart-empty">No balance-sheet data in this range.</div>
          )}
        </Card>
        <Card title="Leverage" subtitle="multiples (×)">
          {hasBS ? (
            <TrendChart
              title="Debt/equity and net debt/EBITDA"
              data={levRows}
              series={[
                { key: "de", name: "Debt / equity", color: "var(--s1)", type: "line" },
                { key: "nde", name: "Net debt / EBITDA", color: "var(--s2)", type: "line" },
              ]}
              format={(n) => fmtMult(n, 2)}
              axisFormat={(n) => `${fmtGrouped(n, 1)}×`}
              note={periodType === "quarterly" ? "Quarterly leverage multiples need balance-sheet data and are only calculated on annual periods." : undefined}
            />
          ) : (
            <div className="chart-empty">No balance-sheet data in this range.</div>
          )}
        </Card>
        <Card title="Returns" subtitle="annual only · ROE on average equity; ROCE on closing capital employed" className="span-2">
          {hasBS && periodType === "annual" ? (
            <TrendChart
              title="Return on equity and return on capital employed"
              data={retRows}
              series={[
                { key: "roe", name: "ROE", color: "var(--s1)", type: "line" },
                { key: "roce", name: "ROCE", color: "var(--s2)", type: "line" },
              ]}
              format={(n) => fmtPct(n)}
              axisFormat={(n) => `${Math.round(n * 100)}%`}
            />
          ) : (
            <div className="chart-empty">Returns need balance-sheet data on annual periods.</div>
          )}
        </Card>
      </div>

      <Card
        title="Statements and ratios"
        subtitle={`${unitLabel} unless stated · “—” = not provided · “R” = restated period`}
        actions={
          <Segmented
            label="Statement"
            value={stmt}
            onChange={setStmt}
            size="sm"
            options={[
              { value: "is", label: "Income" },
              { value: "bs", label: "Balance sheet" },
              { value: "cf", label: "Cash flow" },
              { value: "ratios", label: "Ratios" },
            ]}
          />
        }
      >
        {stmt === "is" && <StatementTable caption="Income statement" rows={IS_ROWS} periods={periods} metrics={metrics} unit={unit} />}
        {stmt === "bs" && <StatementTable caption="Balance sheet" rows={BS_ROWS} periods={periods} metrics={metrics} unit={unit} />}
        {stmt === "cf" && <StatementTable caption="Cash-flow statement" rows={CF_ROWS} periods={periods} metrics={metrics} unit={unit} />}
        {stmt === "ratios" && <StatementTable caption="Financial ratios" rows={RATIO_ROWS} periods={periods} metrics={metrics} unit={unit} />}
      </Card>
    </div>
  );
}
