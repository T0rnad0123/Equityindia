"use client";

import React, { useRef, useState } from "react";
import { Company, FIELD_DEFS, ImportResult } from "@/lib/types";
import { importCsv } from "@/lib/csv";
import { fmtDate } from "@/lib/format";
import { Badge, Callout, Card } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;

const META_DOCS: { col: string; req: boolean; desc: string }[] = [
  { col: "ticker", req: true, desc: "Exchange symbol, e.g. TCS. Upper-cased on import. Identifies the company across rows." },
  { col: "company_name", req: true, desc: "Display name." },
  { col: "exchange", req: true, desc: "NSE, BSE or NSE/BSE." },
  { col: "sector", req: true, desc: "Free text; companies with the same sector text are treated as peers by default." },
  { col: "period_type", req: true, desc: "annual or quarterly." },
  { col: "fiscal_year", req: true, desc: "Indian fiscal year in which the period ENDS: FY2026 = 1 Apr 2025 – 31 Mar 2026. Also accepts FY26 and 2025-26." },
  { col: "quarter", req: false, desc: "Required for quarterly rows: Q1 (Apr–Jun), Q2 (Jul–Sep), Q3 (Oct–Dec), Q4 (Jan–Mar)." },
  { col: "period_end", req: true, desc: "Balance-sheet date, YYYY-MM-DD (DD/MM/YYYY also accepted)." },
  { col: "currency", req: true, desc: "INR only." },
  { col: "unit", req: true, desc: "Unit of every money column in that row: INR_CRORE, INR_LAKH, INR_MILLION or INR. EPS, share price and share count are NOT scaled." },
];

const TRAILER_DOCS: { col: string; desc: string }[] = [
  { col: "price_date", desc: "Date of share_price (YYYY-MM-DD). Strongly recommended whenever a price is given." },
  { col: "source", desc: "Where the numbers came from, e.g. “Annual Report FY2025, standalone, p.123”. Shown in the UI." },
  { col: "source_url", desc: "Public URL of the filing (http/https). Rendered as a link." },
  { col: "last_updated", desc: "Date you last verified the row (YYYY-MM-DD). Shown as “last updated”." },
  { col: "restated", desc: "true/false – mark periods restated in a later filing." },
  { col: "notes", desc: "Free text." },
];

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ImportPanel({
  companies,
  onImport,
  onRemove,
}: {
  companies: Company[];
  onImport: (incoming: Company[]) => void;
  onRemove: (ticker: string) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (t: string, name: string) => {
    setImported(null);
    setText(t);
    setFileName(name);
    setResult(importCsv(t));
  };

  const readFile = async (f: File | undefined | null) => {
    setFileError(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv" && f.type !== "application/vnd.ms-excel" && f.type !== "text/plain") {
      setFileError(`“${f.name}” does not look like a CSV file. Export your sheet as CSV (comma-separated) and try again.`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`The file is ${(f.size / 1048576).toFixed(1)} MB; the limit is 5 MB.`);
      return;
    }
    try {
      validate(await f.text(), f.name);
    } catch {
      setFileError("The file could not be read. Try saving it again as UTF-8 CSV.");
    }
  };

  const issues = result?.issues ?? [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  return (
    <div className="stack">
      <Callout tone="info" title="How data gets into this app">
        This app does not pull live market data and does not call any financial-data API. Automated scraping of exchange or portal websites is
        deliberately not included: those sites have no documented public API and their terms generally restrict scraping. Instead, copy figures
        from company annual reports, investor-relations pages and exchange filings into a CSV in the format below and import it. Every row carries
        its own <code>source</code>, <code>source_url</code> and <code>last_updated</code>, which the dashboard displays.
      </Callout>

      <Card title="Companies in this workspace" subtitle="Demo companies are fictional and cannot be removed; uploaded companies are stored only in this browser.">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Loaded companies">
          <table className="table table-compact">
            <thead><tr><th scope="col">Company</th><th scope="col">Origin</th><th scope="col" className="num">Annual</th><th scope="col" className="num">Quarterly</th><th scope="col">Latest period end</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {companies.map((c) => {
                const ann = c.periods.filter((p) => p.type === "annual").length;
                const q = c.periods.length - ann;
                const last = c.periods[c.periods.length - 1];
                return (
                  <tr key={c.ticker}>
                    <th scope="row">{c.name} <span className="muted">{c.ticker}</span></th>
                    <td><Badge tone={c.origin === "demo" ? "warn" : "accent"}>{c.origin === "demo" ? "Demo · synthetic" : "Uploaded"}</Badge></td>
                    <td className="num">{ann}</td>
                    <td className="num">{q}</td>
                    <td>{last ? fmtDate(last.periodEnd) : "—"}</td>
                    <td>{c.origin === "upload" && <button type="button" className="link-btn" onClick={() => onRemove(c.ticker)} aria-label={`Remove ${c.name}`}>Remove</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Import a CSV"
        subtitle="Validated in your browser – nothing is uploaded to any server."
        actions={
          <div className="row-gap wrap">
            <button type="button" className="btn" onClick={() => download("sample-financials.csv", "/sample-financials.csv")}>Download sample CSV</button>
            <button type="button" className="btn btn-quiet" onClick={() => download("demo-dataset.csv", "/demo-dataset.csv")}>Download demo dataset</button>
          </div>
        }
      >
        <div
          className={dragging ? "drop on" : "drop"}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void readFile(e.dataTransfer.files?.[0]);
          }}
        >
          <p><strong>Drop a .csv file here</strong>, or</p>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv-file" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
          <label htmlFor="csv-file" className="btn btn-primary">Choose file…</label>
          <p className="muted small">Max 5 MB · UTF-8 · comma-separated · one row per company per period</p>
        </div>

        <details className="paste">
          <summary>…or paste CSV text</summary>
          <label htmlFor="csv-paste" className="sr-only">CSV text</label>
          <textarea id="csv-paste" rows={6} value={text} placeholder="ticker,company_name,exchange,sector,period_type,fiscal_year,…" onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <button type="button" className="btn" onClick={() => validate(text, "pasted text")} disabled={!text.trim()}>Validate pasted text</button>
        </details>

        {fileError && <Callout tone="error" role="alert" title="Could not read that file">{fileError}</Callout>}

        {result && (
          <div className="stack" aria-live="polite">
            <h4 className="h4">Validation report{fileName ? ` – ${fileName}` : ""}</h4>
            <dl className="metric-grid">
              <div className="metric"><dt>Data rows</dt><dd>{result.stats.rows}</dd></div>
              <div className="metric"><dt>Companies</dt><dd>{result.stats.companies}</dd></div>
              <div className="metric"><dt>Periods</dt><dd>{result.stats.periods}</dd></div>
              <div className="metric"><dt>Units seen</dt><dd>{Object.keys(result.stats.byUnit).join(", ") || "—"}</dd></div>
              <div className="metric"><dt>Errors</dt><dd className={errors.length ? "neg" : ""}>{errors.length}</dd></div>
              <div className="metric"><dt>Warnings</dt><dd>{warnings.length}</dd></div>
            </dl>

            {result.ok ? (
              <Callout tone="good" title={warnings.length ? "Valid with warnings" : "Valid"}>
                {result.stats.companies} compan{result.stats.companies === 1 ? "y" : "ies"} ready to import. Values will be converted to ₹ crore. Existing periods with the same ticker and fiscal period are replaced; other periods are kept.
              </Callout>
            ) : (
              <Callout tone="error" role="alert" title="Fix the errors below, then re-validate">Nothing is imported until there are no errors. Warnings and notes do not block import.</Callout>
            )}

            {Object.keys(result.stats.missing).length > 0 && (
              <details>
                <summary>Missing values by column ({Object.keys(result.stats.missing).length} columns have blanks)</summary>
                <p className="small muted">Blank cells are kept as missing and shown as “—”. They are never estimated.</p>
                <ul className="chips">
                  {Object.entries(result.stats.missing).map(([k, n]) => (<li key={k}><code>{k}</code> × {n}</li>))}
                </ul>
              </details>
            )}

            {issues.length > 0 && (
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Validation issues">
                <table className="table table-compact">
                  <thead><tr><th scope="col">Level</th><th scope="col">Line</th><th scope="col">Column</th><th scope="col">Message</th></tr></thead>
                  <tbody>
                    {[...errors, ...warnings, ...infos].slice(0, 200).map((i, k) => (
                      <tr key={k}>
                        <td><Badge tone={i.severity === "error" ? "bad" : i.severity === "warning" ? "warn" : "neutral"}>{i.severity === "error" ? "✕ Error" : i.severity === "warning" ? "! Warning" : "i Note"}</Badge></td>
                        <td className="num">{i.line ?? "—"}</td>
                        <td>{i.column ? <code>{i.column}</code> : "—"}</td>
                        <td>{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {issues.length > 200 && <p className="muted small">Showing the first 200 of {issues.length} messages (errors first).</p>}
              </div>
            )}

            <div className="row-gap">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!result.ok}
                onClick={() => {
                  onImport(result.companies);
                  setImported(`Imported ${result.stats.companies} compan${result.stats.companies === 1 ? "y" : "ies"} (${result.stats.periods} periods).`);
                  setResult(null);
                  setText("");
                  setFileName("");
                }}
              >
                Import {result.ok ? `${result.stats.companies} compan${result.stats.companies === 1 ? "y" : "ies"}` : ""}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => { setResult(null); setText(""); setFileName(""); }}>Discard</button>
            </div>
          </div>
        )}
        {imported && <Callout tone="good" role="status" title={imported}>Select the company from the search box at the top of the page.</Callout>}
      </Card>

      <Card title="CSV schema" subtitle="One row per company per period. Header names are case-insensitive. Leave a cell blank when a figure is not available – do not enter 0.">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="CSV schema">
          <table className="table table-compact">
            <thead><tr><th scope="col">Column</th><th scope="col">Required</th><th scope="col">Description</th></tr></thead>
            <tbody>
              {META_DOCS.map((d) => (<tr key={d.col}><th scope="row"><code>{d.col}</code></th><td>{d.req ? "Yes" : "Quarterly rows"}</td><td>{d.desc}</td></tr>))}
              {FIELD_DEFS.map((f) => (
                <tr key={f.key}>
                  <th scope="row"><code>{f.key}</code></th>
                  <td>{f.key === "revenue" || f.key === "net_profit" ? "Yes" : "No"}</td>
                  <td>{f.label}{f.help ? ` – ${f.help}` : ""}. {f.kind === "money" ? "Scaled by the row's unit." : f.kind === "shares" ? "In crore shares." : "In ₹."}</td>
                </tr>
              ))}
              {TRAILER_DOCS.map((d) => (<tr key={d.col}><th scope="row"><code>{d.col}</code></th><td>No</td><td>{d.desc}</td></tr>))}
            </tbody>
          </table>
        </div>
        <h4 className="h4">What the validator checks</h4>
        <ul className="plain small">
          <li>Required columns exist; unknown columns are ignored with a note.</li>
          <li>Period type, fiscal year, quarter and dates are valid; period end is compared with the Indian fiscal calendar (warning only, so non-March year-ends still work).</li>
          <li>Unit is one of the supported values; currency is INR; numbers parse (commas, ₹, and (negative) brackets are accepted).</li>
          <li>No duplicate company/period rows; revenue, debt, cash, share count and price are not negative; capex sign is normalised.</li>
          <li>Plausibility warnings: EBITDA above revenue, profit far above revenue, equity or cash above total assets, EPS inconsistent with profit ÷ shares, and a &gt;50× revenue jump between consecutive periods (a typical lakh/crore mix-up).</li>
        </ul>
      </Card>
    </div>
  );
}
