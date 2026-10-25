"use client";

import React, { useMemo, useState } from "react";
import { Company } from "@/lib/types";
import { DASH, DisplayUnit, fmtGrouped, fmtMoney, fmtMult, fmtPct, fmtPrice, toDisplay } from "@/lib/format";
import {
  MULTIPLE_KEYS,
  MULTIPLE_LABEL,
  MultipleKey,
  PeerRow,
  SCENARIO_KEYS,
  SCENARIO_LABEL,
  ScenarioInputs,
  ScenarioKey,
  SharedInputs,
  ValState,
  Valuation as ValuationResult,
  isPeerIncluded,
  upside,
} from "@/lib/valuation";
import { Badge, Callout, Card, EmptyState, NumField, Segmented, TabPanel, Tabs } from "./ui";
import { ChartRow, RangeChart, TrendChart } from "./charts";

export const VALUATION_DISCLAIMER =
  "Valuation outputs are produced by simple models and depend entirely on the assumptions and peers you select. They are illustrative only, are not investment advice, and are not a recommendation to buy, hold or sell any security. Verify all inputs against primary filings and consult a SEBI-registered adviser before making decisions.";

function Up({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">{DASH}</span>;
  const up = value >= 0;
  return (
    <span className={up ? "delta delta-up" : "delta delta-down"}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "upside" : "downside"}</span> {fmtPct(Math.abs(value), 0)}
    </span>
  );
}

interface Props {
  company: Company;
  state: ValState;
  setState: (u: (s: ValState) => ValState) => void;
  onReset: () => void;
  notes: string[];
  valuation: ValuationResult;
  unit: DisplayUnit;
}

type Sub = "summary" | "comps" | "dcf" | "sens";

export function ValuationPanel({ company, state, setState, onReset, notes, valuation, unit }: Props) {
  const [sub, setSub] = useState<Sub>("summary");
  const set = (patch: Partial<ValState>) => setState((s) => ({ ...s, ...patch }));
  const setSc = (patch: Partial<ScenarioInputs>) =>
    setState((s) => ({ ...s, scenarios: { ...s.scenarios, [s.active]: { ...s.scenarios[s.active], ...patch } } }));
  const setShared = (patch: Partial<SharedInputs>) => setState((s) => ({ ...s, shared: { ...s.shared, ...patch } }));

  const v = valuation;
  const price = v.price;

  return (
    <div className="stack">
      <Callout tone="warn" title="Not investment advice">{VALUATION_DISCLAIMER}</Callout>

      <Tabs
        variant="sub"
        label="Valuation sections"
        value={sub}
        onChange={setSub}
        tabs={[
          { value: "summary", label: "Summary" },
          { value: "comps", label: "Comparables" },
          { value: "dcf", label: "DCF & scenarios" },
          { value: "sens", label: "Sensitivity" },
        ]}
      />

      {sub === "summary" && (
        <TabPanel id="summary" variant="sub">
          <SummaryTab company={company} v={v} state={state} set={set} onReset={onReset} />
        </TabPanel>
      )}
      {sub === "comps" && (
        <TabPanel id="comps" variant="sub">
          <CompsTab company={company} v={v} state={state} setState={setState} unit={unit} />
        </TabPanel>
      )}
      {sub === "dcf" && (
        <TabPanel id="dcf" variant="sub">
          <DcfTab v={v} state={state} set={set} setSc={setSc} setShared={setShared} onReset={onReset} notes={notes} unit={unit} />
        </TabPanel>
      )}
      {sub === "sens" && (
        <TabPanel id="sens" variant="sub">
          <SensTab v={v} state={state} price={price} />
        </TabPanel>
      )}
    </div>
  );
}

/* ------------------------------ Summary ------------------------------ */

function SummaryTab({ company, v, state, set, onReset }: { company: Company; v: ValuationResult; state: ValState; set: (p: Partial<ValState>) => void; onReset: () => void }) {
  const dcfOk = SCENARIO_KEYS.some((k) => v.dcf[k].valid && v.dcf[k].perShare !== null);
  return (
    <div className="stack">
      <div className="grid-2">
        <Card title="Reference price" subtitle="Used to express each value as upside or downside">
          <NumField
            label="Reference share price (₹)"
            value={v.price ?? 0}
            step={1}
            min={0.01}
            suffix="₹"
            onChange={(n) => set({ priceOverride: n })}
            hint={
              v.priceIsOverride
                ? "Your override. Not a live quote."
                : v.price !== null
                ? `Snapshot from the dataset${v.priceDate ? " as of " + v.priceDate : " (undated)"}. Not a live quote.`
                : "No price in the dataset – enter one to see upside/downside."
            }
          />
          {state.priceOverride !== null && (
            <button type="button" className="btn btn-quiet" onClick={() => set({ priceOverride: null })}>Use dataset price</button>
          )}
        </Card>
        <Card title="Where the numbers come from">
          <ul className="plain">
            <li><strong>Comparables:</strong> {v.selectedPeers.length} peer{v.selectedPeers.length === 1 ? "" : "s"} selected from the {v.peers.length} other companies in your dataset.</li>
            <li><strong>DCF:</strong> five-line free-cash-flow model with a Gordon-growth terminal value; bear / base / bull are separate assumption sets.</li>
            <li><strong>Everything is editable</strong> in the other tabs and recalculates immediately. <button type="button" className="link-btn" onClick={onReset}>Reset all assumptions for {company.ticker}</button></li>
          </ul>
        </Card>
      </div>

      {v.football.length === 0 ? (
        <EmptyState title="Not enough information to value this company yet">
          Select at least one peer with usable multiples, and make sure the latest annual year has net profit, EBITDA or equity plus a share count. DCF needs revenue, a share count and WACC above terminal growth.
        </EmptyState>
      ) : (
        <Card>
          <RangeChart rows={v.football} price={v.price} />
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Valuation summary table">
            <table className="table">
              <thead>
                <tr><th scope="col">Method</th><th scope="col" className="num">Low</th><th scope="col" className="num">Mid</th><th scope="col" className="num">High</th><th scope="col" className="num">Mid vs price</th></tr>
              </thead>
              <tbody>
                {v.football.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td className="num">{fmtPrice(r.low)}</td>
                    <td className="num"><strong>{fmtPrice(r.mid)}</strong></td>
                    <td className="num">{fmtPrice(r.high)}</td>
                    <td className="num"><Up value={upside(r.mid, v.price)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dcfOk && (
        <Card title="Scenario values (DCF)" subtitle="Per share, from the assumptions in the DCF tab">
          <div className="scen-grid">
            {SCENARIO_KEYS.map((k) => {
              const r = v.dcf[k];
              return (
                <div key={k} className={`scen scen-${k}`}>
                  <div className="scen-name">{SCENARIO_LABEL[k]}</div>
                  <div className="scen-val">{r.valid ? fmtPrice(r.perShare) : DASH}</div>
                  <div>{r.valid ? <Up value={upside(r.perShare, v.price)} /> : <span className="muted">{r.reason}</span>}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ Comparables ------------------------------ */

function CompsTab({ company, v, state, setState, unit }: { company: Company; v: ValuationResult; state: ValState; setState: (u: (s: ValState) => ValState) => void; unit: DisplayUnit }) {
  const sortKey = state.sortKey;
  const visible = useMemo(() => {
    const minCr = state.minMcap;
    const list = v.peers.filter((p) => (state.sectorFilter === "all" || p.sector === company.sector) && (minCr <= 0 || (p.mcap !== null && p.mcap >= minCr)));
    const dir = state.sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey as keyof PeerRow] as number | null;
      const bv = b[sortKey as keyof PeerRow] as number | null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last regardless of direction
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [v.peers, state.sectorFilter, state.minMcap, state.sortDir, sortKey, company.sector]);

  const toggle = (p: PeerRow) =>
    setState((s) => ({ ...s, included: { ...s.included, [p.ticker]: !isPeerIncluded(s, company, p) } }));
  const setMany = (rows: PeerRow[], on: boolean) =>
    setState((s) => {
      const inc = { ...s.included };
      rows.forEach((r) => (inc[r.ticker] = on));
      return { ...s, included: inc };
    });
  const sortBy = (k: ValState["sortKey"]) =>
    setState((s) => (s.sortKey === k ? { ...s, sortDir: s.sortDir === "asc" ? "desc" : "asc" } : { ...s, sortKey: k, sortDir: k === "name" ? "asc" : "desc" }));

  const th = (k: ValState["sortKey"], children: React.ReactNode, num = true) => (
    <th scope="col" key={k} className={num ? "num" : ""} aria-sort={sortKey === k ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-btn" onClick={() => sortBy(k)}>
        {children}
        <span aria-hidden="true" className="sort-ind">{sortKey === k ? (state.sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
  const nm = (x: number | null, d = 1) => (x === null ? <span className="na" title="Not meaningful: missing data or non-positive denominator">NM</span> : fmtMult(x, d));

  return (
    <div className="stack">
      <Card
        title="Peer selection"
        subtitle={`${v.selectedPeers.length} of ${v.peers.length} companies selected · multiples use each peer's latest annual year and the price snapshot in your data`}
        actions={
          <div className="row-gap">
            <Segmented label="Sector filter" size="sm" value={state.sectorFilter} onChange={(x) => setState((s) => ({ ...s, sectorFilter: x }))} options={[{ value: "same", label: "Same sector" }, { value: "all", label: "All sectors" }]} />
          </div>
        }
      >
        <div className="row-gap wrap">
          <NumField compact label="Min market cap (₹ crore)" value={state.minMcap} min={0} step={1000} onChange={(n) => setState((s) => ({ ...s, minMcap: n }))} />
          <button type="button" className="btn" onClick={() => setMany(visible, true)} disabled={visible.length === 0}>Select all shown</button>
          <button type="button" className="btn" onClick={() => setMany(v.peers, false)}>Clear selection</button>
        </div>
        {v.peers.length === 0 ? (
          <EmptyState title="No other companies in your dataset">Import a CSV with more than one company to build a peer set.</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState title="No peers match the filters">Try “All sectors” or lower the minimum market cap.</EmptyState>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Peer companies">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Include</span></th>
                  {th("name", "Company", false)}
                  <th scope="col">Sector</th>
                  {th("mcap", `Mkt cap (${unit === "crore" ? "₹ Cr" : unit === "lakh" ? "₹ L" : "₹ mn"})`)}
                  {th("pe", "P/E")}
                  {th("evEbitda", "EV/EBITDA")}
                  {th("evSales", "EV/Sales")}
                  {th("pb", "P/B")}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const on = isPeerIncluded(state, company, p);
                  return (
                    <tr key={p.ticker} className={on ? "" : "dim"}>
                      <td><input type="checkbox" checked={on} onChange={() => toggle(p)} aria-label={`Include ${p.name} in peer set`} /></td>
                      <th scope="row">
                        {p.name} <span className="muted">{p.ticker}</span> {p.origin === "demo" && <Badge tone="warn">Demo</Badge>}
                      </th>
                      <td>{p.sector}</td>
                      <td className="num">{p.mcap === null ? DASH : fmtMoney(p.mcap, unit, 0)}</td>
                      <td className="num">{nm(p.pe)}</td>
                      <td className="num">{nm(p.evEbitda)}</td>
                      <td className="num">{nm(p.evSales, 2)}</td>
                      <td className="num">{nm(p.pb, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Implied value for ${company.ticker}`} subtitle="Peer statistics use selected peers only. Edit “Applied multiple” to override the median.">
        {v.selectedPeers.length === 0 ? (
          <EmptyState title="Select at least one peer">Tick companies in the table above to compute peer multiples and implied values.</EmptyState>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Implied valuation from comparables">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Multiple</th>
                  <th scope="col" className="num">Peers (n)</th>
                  <th scope="col" className="num">Q1</th>
                  <th scope="col" className="num">Median</th>
                  <th scope="col" className="num">Q3</th>
                  <th scope="col">Applied multiple</th>
                  <th scope="col" className="num">Applied to</th>
                  <th scope="col" className="num">Value / share (Q1 · applied · Q3)</th>
                </tr>
              </thead>
              <tbody>
                {v.comps.map((c) => (
                  <tr key={c.key}>
                    <th scope="row">{c.label}</th>
                    <td className="num">{c.stats.n}</td>
                    <td className="num">{fmtMult(c.stats.q1, 1)}</td>
                    <td className="num">{fmtMult(c.stats.median, 1)}</td>
                    <td className="num">{fmtMult(c.stats.q3, 1)}</td>
                    <td>
                      {c.stats.n === 0 && !c.overridden ? (
                        <span className="na">no peer data</span>
                      ) : (
                        <div className="row-gap">
                          <NumField compact label={`${c.label} applied multiple`} value={Number((c.used ?? 0).toFixed(2))} step={0.1} min={0.01} suffix="×" onChange={(n) => setState((s) => ({ ...s, multipleOverride: { ...s.multipleOverride, [c.key]: n } }))} />
                          {c.overridden && (
                            <button type="button" className="link-btn" onClick={() => setState((s) => { const m = { ...s.multipleOverride }; delete m[c.key as MultipleKey]; return { ...s, multipleOverride: m }; })}>reset</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="num">{c.metric === null ? DASH : `${c.metricLabel} ${fmtMoney(c.metric, unit)}`}</td>
                    <td className="num">
                      {c.mid === null ? <span className="na" title="Needs a positive metric and a share count">NM</span> : (
                        <>
                          {c.low !== null ? fmtPrice(c.low) : DASH} · <strong>{fmtPrice(c.mid)}</strong> · {c.high !== null ? fmtPrice(c.high) : DASH}
                          <div><Up value={upside(c.mid, v.price)} /></div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">EV-based multiples subtract net debt (₹ {fmtGrouped(state.shared.netDebt, 0)} crore) and divide by {fmtGrouped(state.shared.shares, 2)} crore shares – both editable in the DCF tab. NM = not meaningful (missing or non-positive).</p>
      </Card>
    </div>
  );
}

/* ------------------------------ DCF ------------------------------ */

function DcfTab({
  v, state, set, setSc, setShared, onReset, notes, unit,
}: {
  v: ValuationResult; state: ValState; set: (p: Partial<ValState>) => void; setSc: (p: Partial<ScenarioInputs>) => void; setShared: (p: Partial<SharedInputs>) => void; onReset: () => void; notes: string[]; unit: DisplayUnit;
}) {
  const sc = state.scenarios[state.active];
  const sh = state.shared;
  const r = v.dcf[state.active];
  const unitLabel = unit === "crore" ? "₹ crore" : unit === "lakh" ? "₹ lakh" : "₹ million";
  const rows: ChartRow[] = r.years.map((y) => ({
    label: `Y${y.year}`,
    revenue: toDisplay(y.revenue, unit),
    fcff: toDisplay(y.fcff, unit),
  }));
  const fmtDisp = (n: number) => fmtGrouped(n, Math.abs(n) >= 100 ? 0 : 1, unit);

  return (
    <div className="stack">
      <div className="grid-dcf">
        <Card
          title="Assumptions"
          subtitle="Edit any field – results update immediately"
          actions={<button type="button" className="btn btn-quiet" onClick={onReset}>Reset to derived defaults</button>}
        >
          <div className="field-group">
            <div className="field-group-title">Scenario</div>
            <Segmented<ScenarioKey> label="Active scenario" value={state.active} onChange={(a) => set({ active: a })} options={SCENARIO_KEYS.map((k) => ({ value: k, label: SCENARIO_LABEL[k] }))} />
            <div className="field-grid">
              <NumField label="Revenue growth, year 1" percent value={sc.growthStart} min={-50} max={100} step={0.5} onChange={(n) => setSc({ growthStart: n })} />
              <NumField label="Revenue growth, final year" percent value={sc.growthEnd} min={-50} max={100} step={0.5} onChange={(n) => setSc({ growthEnd: n })} hint="Growth fades linearly from year 1" />
              <NumField label="Terminal EBITDA margin" percent value={sc.ebitdaMargin} min={-50} max={95} step={0.5} onChange={(n) => setSc({ ebitdaMargin: n })} hint="Reached in the final year" />
              <NumField label="WACC" percent value={sc.wacc} min={1} max={40} step={0.25} onChange={(n) => setSc({ wacc: n })} />
              <NumField label="Terminal growth" percent value={sc.terminalGrowth} min={-5} max={15} step={0.25} onChange={(n) => setSc({ terminalGrowth: n })} hint="Must be below WACC" />
            </div>
          </div>
          <div className="field-group">
            <div className="field-group-title">Shared across scenarios</div>
            <div className="field-grid">
              <NumField label="Forecast years" value={sh.years} min={1} max={15} step={1} suffix="yrs" onChange={(n) => setShared({ years: Math.round(n) })} />
              <NumField label="Tax rate" percent value={sh.taxRate} min={0} max={60} step={0.5} onChange={(n) => setShared({ taxRate: n })} />
              <NumField label="D&A, % of revenue" percent value={sh.daPct} min={0} max={50} step={0.5} onChange={(n) => setShared({ daPct: n })} />
              <NumField label="Capex, % of revenue" percent value={sh.capexPct} min={0} max={60} step={0.5} onChange={(n) => setShared({ capexPct: n })} />
              <NumField label="Working capital, % of Δ revenue" percent value={sh.nwcPct} min={0} max={100} step={1} onChange={(n) => setShared({ nwcPct: n })} />
              <NumField label="Base-year EBITDA margin" percent value={sh.baseMargin} min={-50} max={95} step={0.5} onChange={(n) => setShared({ baseMargin: n })} />
              <NumField label="Base-year revenue" value={Number(sh.baseRevenue.toFixed(2))} min={0} step={100} suffix="₹ Cr" onChange={(n) => setShared({ baseRevenue: n })} />
              <NumField label="Net debt (negative = net cash)" value={Number(sh.netDebt.toFixed(2))} step={100} suffix="₹ Cr" onChange={(n) => setShared({ netDebt: n })} />
              <NumField label="Shares outstanding" value={Number(sh.shares.toFixed(4))} min={0} step={0.1} suffix="Cr sh" onChange={(n) => setShared({ shares: n })} />
            </div>
          </div>
          <details className="notes">
            <summary>How the starting values were derived</summary>
            <ul className="plain small">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </details>
        </Card>

        <div className="stack">
          {!r.valid ? (
            <Callout tone="error" role="alert" title="This scenario cannot be valued">{r.reason}</Callout>
          ) : (
            <Card title={`${SCENARIO_LABEL[state.active]} case result`} subtitle="Intrinsic value from discounted free cash flow to the firm">
              <div className="result-hero">
                <div>
                  <div className="kpi-label">Value per share</div>
                  <div className="result-value">{fmtPrice(r.perShare)}</div>
                  <Up value={upside(r.perShare, v.price)} /> <span className="muted small">vs reference {fmtPrice(v.price)}</span>
                </div>
                <dl className="metric-grid metric-grid-2">
                  <div className="metric"><dt>Enterprise value</dt><dd>₹{fmtMoney(r.ev, unit)}</dd></div>
                  <div className="metric"><dt>Equity value</dt><dd>₹{fmtMoney(r.equity, unit)}</dd></div>
                  <div className="metric"><dt>PV of forecast FCF</dt><dd>₹{fmtMoney(r.sumPv, unit)}</dd></div>
                  <div className="metric"><dt>PV of terminal value</dt><dd>₹{fmtMoney(r.pvTerminal, unit)}</dd></div>
                </dl>
              </div>
              {r.terminalShare > 0.75 && <Callout tone="warn" title="Terminal value dominates">{fmtPct(r.terminalShare, 0)} of enterprise value comes from the terminal value, so the result is very sensitive to WACC and terminal growth.</Callout>}
              {r.perShare === null && <Callout tone="warn" title="Per-share value unavailable">Enter a share count above zero.</Callout>}
              {r.perShare !== null && r.perShare < 0 && <Callout tone="warn" title="Negative equity value">Net debt exceeds enterprise value under these assumptions.</Callout>}
            </Card>
          )}

          {r.valid && (
            <Card title="Projection" subtitle={unitLabel}>
              <TrendChart
                title="Forecast revenue and free cash flow to firm"
                data={rows}
                series={[
                  { key: "revenue", name: "Revenue", color: "var(--s1)", type: "bar" },
                  { key: "fcff", name: "FCFF", color: "var(--s3)", type: "line" },
                ]}
                format={fmtDisp}
                height={220}
              />
              <div className="table-wrap" tabIndex={0} role="region" aria-label="DCF projection table">
                <table className="table table-compact">
                  <thead>
                    <tr><th scope="col">Year</th><th scope="col" className="num">Growth</th><th scope="col" className="num">Revenue</th><th scope="col" className="num">EBITDA</th><th scope="col" className="num">Margin</th><th scope="col" className="num">FCFF</th><th scope="col" className="num">PV</th></tr>
                  </thead>
                  <tbody>
                    {r.years.map((y) => (
                      <tr key={y.year}>
                        <th scope="row">Y{y.year}</th>
                        <td className="num">{fmtPct(y.growth)}</td>
                        <td className="num">{fmtMoney(y.revenue, unit)}</td>
                        <td className="num">{fmtMoney(y.ebitda, unit)}</td>
                        <td className="num">{fmtPct(y.margin)}</td>
                        <td className={y.fcff < 0 ? "num neg" : "num"}>{fmtMoney(y.fcff, unit)}</td>
                        <td className="num">{fmtMoney(y.pv, unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card title="Bear · base · bull" subtitle="All three scenarios side by side. Select a scenario above to edit its assumptions.">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scenario comparison">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col" className="num">Growth Y1 → final</th>
                <th scope="col" className="num">Terminal margin</th>
                <th scope="col" className="num">WACC</th>
                <th scope="col" className="num">Terminal g</th>
                <th scope="col" className="num">EV</th>
                <th scope="col" className="num">Value / share</th>
                <th scope="col" className="num">vs price</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIO_KEYS.map((k) => {
                const s = state.scenarios[k];
                const x = v.dcf[k];
                return (
                  <tr key={k} className={k === state.active ? "active-row" : ""}>
                    <th scope="row">{SCENARIO_LABEL[k]}</th>
                    <td className="num">{fmtPct(s.growthStart)} → {fmtPct(s.growthEnd)}</td>
                    <td className="num">{fmtPct(s.ebitdaMargin)}</td>
                    <td className="num">{fmtPct(s.wacc, 2)}</td>
                    <td className="num">{fmtPct(s.terminalGrowth, 2)}</td>
                    <td className="num">{x.valid ? `₹${fmtMoney(x.ev, unit)}` : DASH}</td>
                    <td className="num">{x.valid ? <strong>{fmtPrice(x.perShare)}</strong> : <span className="na" title={x.reason}>invalid</span>}</td>
                    <td className="num">{x.valid ? <Up value={upside(x.perShare, v.price)} /> : DASH}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Sensitivity ------------------------------ */

function Heat({ grid, price, scenarioLabel }: { grid: ValuationResult["sensitivityA"]; price: number | null; scenarioLabel: string }) {
  const centre = grid.cells[grid.baseRow][grid.baseCol];
  const ref = price !== null && price > 0 ? price : centre;
  return (
    <Card title={grid.title} subtitle={`${scenarioLabel} case · ₹ per share${price !== null ? " · % = vs reference price" : ""}`}>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={grid.title}>
        <table className="table heat">
          <thead>
            <tr>
              <th scope="col" className="corner">{grid.rowLabel} ↓ / {grid.colLabel} →</th>
              {grid.cols.map((c, j) => (
                <th scope="col" key={j} className={j === grid.baseCol ? "num base-axis" : "num"}>{fmtPct(c, 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((rv, i) => (
              <tr key={i}>
                <th scope="row" className={i === grid.baseRow ? "base-axis" : ""}>{fmtPct(rv, 1)}</th>
                {grid.cells[i].map((cv, j) => {
                  if (cv === null || ref === null || !(ref > 0)) {
                    return <td key={j} className="num na" title="WACC must exceed terminal growth, or inputs are missing">n/a</td>;
                  }
                  const t = Math.max(-1, Math.min(1, (cv / ref - 1) / 0.5));
                  const mix = Math.round(Math.abs(t) * 55);
                  const bg = `color-mix(in srgb, ${t >= 0 ? "var(--s1)" : "var(--s2)"} ${mix}%, var(--surface))`;
                  const isBase = i === grid.baseRow && j === grid.baseCol;
                  return (
                    <td key={j} className={isBase ? "num heat-cell base-cell" : "num heat-cell"} style={{ background: bg }}>
                      <span className="heat-val">{fmtPrice(cv).replace(".00", "")}</span>
                      {price !== null && <span className="heat-pct">{cv / ref - 1 >= 0 ? "+" : "−"}{fmtPct(Math.abs(cv / ref - 1), 0)}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SensTab({ v, state, price }: { v: ValuationResult; state: ValState; price: number | null }) {
  const label = SCENARIO_LABEL[state.active];
  return (
    <div className="stack">
      <Callout tone="info" title={`Sensitivity runs on the ${label} case`}>
        Change the active scenario in the DCF tab to analyse another one. Blue shading = value above the reference price, orange = below; the outlined cell is your current assumption set. Every cell is a full DCF re-run.
      </Callout>
      <Heat grid={v.sensitivityA} price={price} scenarioLabel={label} />
      <Heat grid={v.sensitivityB} price={price} scenarioLabel={label} />
      <p className="muted small">Axis steps: WACC ±1pp, terminal growth ±0.5pp, year-1 growth ±2pp, terminal margin ±2pp.</p>
    </div>
  );
}
