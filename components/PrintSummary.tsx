"use client";

import React from "react";
import { Company, Period, PeriodType } from "@/lib/types";
import { PeriodMetrics, marketCap, mcapCategory } from "@/lib/metrics";
import { DASH, DisplayUnit, fmtDate, fmtMoney, fmtMult, fmtPct, fmtPrice } from "@/lib/format";
import { SCENARIO_KEYS, SCENARIO_LABEL, ValState, Valuation, upside } from "@/lib/valuation";
import { VALUATION_DISCLAIMER } from "./Valuation";

/** Rendered always, but only visible when printing (see globals.css @media print). */
export function PrintSummary({
  company,
  periods,
  metrics,
  periodType,
  unit,
  valuation: v,
  state,
  sourceLine,
  statusLine,
}: {
  company: Company;
  periods: Period[];
  metrics: PeriodMetrics[];
  periodType: PeriodType;
  unit: DisplayUnit;
  valuation: Valuation;
  state: ValState;
  sourceLine: string;
  statusLine: string;
}) {
  const unitLabel = unit === "crore" ? "₹ crore" : unit === "lakh" ? "₹ lakh" : "₹ million";
  const cap = marketCap(company);
  const lines: { label: string; get: (p: Period, m: PeriodMetrics) => string }[] = [
    { label: "Revenue", get: (p) => fmtMoney(p.v.revenue, unit) },
    { label: "Revenue growth", get: (_, m) => fmtPct(m.revenueGrowth) },
    { label: "EBITDA", get: (p) => fmtMoney(p.v.ebitda, unit) },
    { label: "EBITDA margin", get: (_, m) => fmtPct(m.ebitdaMargin) },
    { label: "Net profit", get: (p) => fmtMoney(p.v.net_profit, unit) },
    { label: "Net margin", get: (_, m) => fmtPct(m.netMargin) },
    { label: "EPS (₹)", get: (_, m) => (m.eps === null ? DASH : m.eps.toFixed(2)) },
    { label: "Total borrowings", get: (p) => fmtMoney(p.v.total_debt, unit) },
    { label: "Cash & liquid investments", get: (p) => fmtMoney(p.v.cash, unit) },
    { label: "Operating cash flow", get: (p) => fmtMoney(p.v.cfo, unit) },
    { label: "Free cash flow", get: (_, m) => fmtMoney(m.fcf, unit) },
    { label: "ROE", get: (_, m) => fmtPct(m.roe) },
    { label: "ROCE", get: (_, m) => fmtPct(m.roce) },
    { label: "Debt / equity", get: (_, m) => fmtMult(m.debtToEquity, 2) },
    { label: "Net debt / EBITDA", get: (_, m) => fmtMult(m.netDebtToEbitda, 2) },
  ];

  return (
    <div className="print-only print-doc">
      <header>
        <h1>{company.name}</h1>
        <p>
          {company.ticker} · {company.exchange} · {company.sector} · {mcapCategory(cap)} (indicative)
          {cap !== null ? ` · Market cap snapshot ₹${fmtMoney(cap, unit, 0)} ${unitLabel.replace("₹ ", "")}` : ""}
        </p>
        <p className="print-flag">{statusLine}</p>
        <p>Source: {sourceLine}. Generated {new Date().toLocaleDateString("en-IN")} from data supplied to the app; no live data feed.</p>
      </header>

      <h2>Financial summary ({periodType}, {unitLabel})</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            {periods.map((p) => (<th key={p.key}>{p.label}{p.restated ? " (R)" : ""}</th>))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <th>{l.label}</th>
              {periods.map((p, i) => (<td key={p.key}>{l.get(p, metrics[i])}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">“—” = not provided or not computable. R = restated period.</p>

      <h2>Valuation snapshot</h2>
      <p>
        Reference price: {fmtPrice(v.price)} {v.priceIsOverride ? "(user override)" : v.priceDate ? `(dataset snapshot, ${fmtDate(v.priceDate)})` : "(dataset snapshot)"} – not a live quote.
      </p>
      <table>
        <thead><tr><th>DCF scenario</th><th>Growth Y1→final</th><th>Terminal EBITDA margin</th><th>WACC</th><th>Terminal g</th><th>Value / share</th><th>vs price</th></tr></thead>
        <tbody>
          {SCENARIO_KEYS.map((k) => {
            const s = state.scenarios[k];
            const r = v.dcf[k];
            const up = upside(r.perShare, v.price);
            return (
              <tr key={k}>
                <th>{SCENARIO_LABEL[k]}</th>
                <td>{fmtPct(s.growthStart)} → {fmtPct(s.growthEnd)}</td>
                <td>{fmtPct(s.ebitdaMargin)}</td>
                <td>{fmtPct(s.wacc, 2)}</td>
                <td>{fmtPct(s.terminalGrowth, 2)}</td>
                <td>{r.valid ? fmtPrice(r.perShare) : "invalid"}</td>
                <td>{up === null ? DASH : `${up >= 0 ? "+" : "−"}${fmtPct(Math.abs(up), 0)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small">Shared: {state.shared.years}-year forecast · tax {fmtPct(state.shared.taxRate)} · D&amp;A {fmtPct(state.shared.daPct)} and capex {fmtPct(state.shared.capexPct)} of revenue · working capital {fmtPct(state.shared.nwcPct, 0)} of Δ revenue · net debt ₹{fmtMoney(state.shared.netDebt, "crore")} crore · {state.shared.shares} crore shares.</p>

      <table>
        <thead><tr><th>Comparable multiple</th><th>Peers</th><th>Q1</th><th>Median</th><th>Q3</th><th>Applied</th><th>Value / share (Q1 · applied · Q3)</th></tr></thead>
        <tbody>
          {v.comps.map((c) => (
            <tr key={c.key}>
              <th>{c.label}</th>
              <td>{c.stats.n}</td>
              <td>{fmtMult(c.stats.q1)}</td>
              <td>{fmtMult(c.stats.median)}</td>
              <td>{fmtMult(c.stats.q3)}</td>
              <td>{fmtMult(c.used)}{c.overridden ? " (override)" : ""}</td>
              <td>{c.mid === null ? "NM" : `${fmtPrice(c.low)} · ${fmtPrice(c.mid)} · ${fmtPrice(c.high)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">Peers used: {v.selectedPeers.length ? v.selectedPeers.map((p) => p.ticker).join(", ") : "none selected"}.</p>

      <p className="print-disclaimer"><strong>Important:</strong> {VALUATION_DISCLAIMER}</p>
    </div>
  );
}
