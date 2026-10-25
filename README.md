# Equity Lens India

A financial-analysis and valuation workbench for companies listed on the **NSE** and **BSE**. Search a company, read its income statement, balance sheet and cash flow, inspect ratios and charts, then value it with **comparable-company multiples** and a **DCF with bear / base / bull cases and sensitivity tables**. Every assumption is editable and every output updates immediately.

- **No API keys. No paid data. No backend.** The app is a static-friendly Next.js project; all analysis runs in the browser.
- **Bring your own data** from annual reports, investor-relations pages and exchange filings via a documented CSV format. A small **synthetic demo dataset** is bundled so the app works immediately.
- **Transparent provenance.** Every period carries `source`, `source_url`, `last_updated` and a `restated` flag, and the UI shows them. Demo data is labelled as fictional everywhere it appears.

> **Not investment advice.** Valuation outputs depend entirely on the assumptions and peers you choose. See [Disclaimer](#disclaimer).

---

## Quick start

Requirements: Node.js 18.18+ (20 or 22 recommended) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other commands:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run generate:demo   # regenerate the synthetic demo dataset (see below)
```

## Deploy to Vercel

No environment variables, database or special infrastructure are needed.

**Option A – Git import (recommended)**

1. Unzip, then push the folder to a new GitHub / GitLab / Bitbucket repository.
2. In Vercel choose **Add New → Project**, import the repository.
3. Leave the detected settings (Framework: **Next.js**, build command `next build`, output default). Click **Deploy**.

**Option B – Vercel CLI**

```bash
npm install -g vercel
cd equity-lens-india
vercel          # first deploy (preview) – follow the prompts
vercel --prod   # promote to production
```

No `.env.example` is provided because the app needs no environment variables.

---

## Using the app

| Area | What you can do |
|---|---|
| **Search & header** | Typeahead by name, ticker or sector. Shows exchange, sector, an *indicative* market-cap bucket and a Demo / Uploaded badge. |
| **Controls** | Annual vs quarterly view; date range (from / to selects and “Last 3/5”, “Last 4/8”, “All” presets); display units ₹ crore / ₹ lakh / ₹ million with Indian digit grouping (12,34,567). Fiscal-year labels follow the Indian April–March convention (FY26 = year ended 31 Mar 2026). |
| **Provenance strip** | Source, reporting basis, units, last-updated date, share-price date, restated periods, and a *Demo / User-supplied / Possibly stale* status. Periods ended more than 15 months ago are flagged as possibly stale. |
| **Overview** | KPI cards (revenue, EBITDA, net profit, EPS, borrowings, cash, net debt, market cap) with YoY change and sparklines, margin and earnings charts, operating metrics, and a data-completeness report. |
| **Financials** | Charts for revenue/EBITDA/profit, EPS, margins, cash flow, debt & cash, leverage and returns; statement tables (income, balance sheet, cash flow) and a ratio table; CAGR strip. Missing values show “—” (never estimated); restated periods carry an “R” badge. |
| **Valuation → Summary** | Reference price (dataset snapshot or your override), a value-per-share range chart across methods, and bear/base/bull values vs price. |
| **Valuation → Comparables** | Include/exclude peers, filter by sector or minimum market cap, sort by any column, see P/E, EV/EBITDA, EV/Sales, P/B; peer Q1/median/Q3; **override the applied multiple**; implied value per share. |
| **Valuation → DCF & scenarios** | Editable growth, margin, WACC, terminal growth, tax, D&A, capex, working capital, base figures, net debt, share count; projection table and chart; bear/base/bull side by side. |
| **Valuation → Sensitivity** | Two heat-maps recomputed with a full DCF per cell: WACC × terminal growth and year-1 growth × terminal margin. |
| **Data & import** | Drag-and-drop or paste a CSV; validation report with errors, warnings and notes; import only when there are no errors; remove uploaded companies; download the sample CSV and the demo dataset. |
| **Export** | *Export financials CSV* (same schema as the import format, always in ₹ crore, re-importable) and *Export valuation CSV* (assumptions, results, comps, peers and sensitivity grids in a long format). *Print summary* opens the browser print dialog (save as PDF) with a clean one-to-two page company summary. |
| **Theme** | Light and dark themes (follows the OS setting until you choose; remembered in the browser). |

Uploaded companies and display preferences are kept in the browser's `localStorage` only; nothing is sent to any server. If storage is blocked, the app says so and keeps working for the session.

---

## CSV schema

One row per **company per period**. Header names are case-insensitive; spaces/hyphens are treated as underscores. Leave a cell **blank** when a figure is not available – do not enter 0 (a blank is shown as “—” and excluded from ratios; a 0 is treated as a real zero).

A ready-to-use example is in [`public/sample-financials.csv`](public/sample-financials.csv) (one fictional company with values in **INR lakh**, to demonstrate unit conversion). The full demo dataset is in [`public/demo-dataset.csv`](public/demo-dataset.csv).

### Identification and period columns

| Column | Required | Notes |
|---|---|---|
| `ticker` | yes | Exchange symbol. Upper-cased on import. |
| `company_name` | yes | |
| `exchange` | yes | `NSE`, `BSE` or `NSE/BSE`. |
| `sector` | yes | Free text. Companies with identical sector text are default peers. |
| `period_type` | yes | `annual` or `quarterly`. |
| `fiscal_year` | yes | Indian fiscal year in which the period **ends**: `FY2026` = 1 Apr 2025 – 31 Mar 2026. `FY26` and `2025-26` are accepted. |
| `quarter` | quarterly rows | `Q1` (Apr–Jun), `Q2` (Jul–Sep), `Q3` (Oct–Dec), `Q4` (Jan–Mar). |
| `period_end` | yes | `YYYY-MM-DD` (day-first `DD/MM/YYYY` also accepted). Compared with the Indian fiscal calendar; a mismatch is a **warning**, so non-March year-ends still work. |
| `currency` | yes | `INR` only. |
| `unit` | yes | Unit of every money column in that row: `INR_CRORE`, `INR_LAKH`, `INR_MILLION` or `INR`. Converted to ₹ crore on import. EPS, share price and share count are **not** scaled. |

### Financial columns (all numeric; blank = missing)

| Column | Required | Meaning |
|---|---|---|
| `revenue` | yes | Revenue from operations |
| `net_profit` | yes | Profit after tax attributable to owners (may be negative) |
| `ebitda` | no | |
| `depreciation` | no | Positive number |
| `interest_expense` | no | Finance costs, positive |
| `pbt` | no | Profit before tax |
| `tax` | no | Total tax expense |
| `eps` | no | Basic EPS, ₹ per share |
| `shares_outstanding_cr` | no | Shares in **crore** (e.g. 420 = 420 crore shares). Needed for per-share valuation and market cap. |
| `total_assets`, `total_equity`, `total_debt`, `cash`, `current_assets`, `current_liabilities` | no | Balance-sheet items at `period_end`. `total_debt` = borrowings; `cash` = cash, bank balances and liquid investments. |
| `cfo`, `cfi`, `cff` | no | Cash-flow statement totals (signed) |
| `capex` | no | Enter as a **positive** number (cash spent). A negative value is flipped with a warning. |
| `share_price` | no | ₹ per share snapshot you supply |

### Provenance columns

| Column | Notes |
|---|---|
| `price_date` | Date of `share_price`. Recommended whenever a price is present. |
| `source` | e.g. “Annual Report FY2025, consolidated, p. 123”. Rows without it are labelled “source not stated”. |
| `source_url` | `http(s)` link to the filing; rendered as a link. |
| `last_updated` | Date you last verified the row. |
| `restated` | `true` / `false`. Restated periods get an “R” badge. |
| `notes` | Free text. |

Numbers may contain commas and a `₹` sign; `(123)` is read as −123. Missing markers `NA`, `N/A`, `-`, `—` are treated as blank.

### What validation checks

Required columns; unknown columns (ignored, noted); valid period type / fiscal year / quarter / dates; supported unit and currency; numeric parsing; **duplicate** company-period rows; negative revenue, borrowings, cash, share count or price; plausibility warnings (EBITDA above revenue, profit far above revenue, equity or cash above total assets, EPS inconsistent with profit ÷ shares, >50× revenue jump between consecutive periods – the usual lakh-vs-crore mistake); and a missing-values-by-column summary. **Errors block the import; warnings and notes do not.** Importing a ticker that already exists replaces matching periods and keeps the rest.

---

## Data sources, limitations and honesty rules

- **No live data.** The app never fetches quotes, filings or fundamentals. There is no scraping and no use of undocumented endpoints, because exchange and portal websites do not offer a documented public API for this and their terms generally restrict automated access. If you want automation, build a separate pipeline that is permitted by your source and have it write the CSV format above.
- **The bundled demo dataset is synthetic.** Nine fictional companies (tickers prefixed `DEMO-`) are *generated* by `scripts/generate-demo.mjs` from a seeded pseudo-random model so that the dashboard works on first load. The numbers are not real, are not derived from any filing, and have no relation to any listed company. Every row says so in its `source` field and the UI shows “Demo · synthetic” banners, badges and print-outs. Some cells are blank on purpose to demonstrate missing-data handling, and one period is flagged restated to demonstrate that badge. Demo balance sheets are internally plausible but are **not** reconciled to the demo cash flows.
- **Prices are snapshots you provide.** Market cap, P/E, EV/EBITDA, EV/Sales and P/B use the `share_price` (and its `price_date`) in your file. The reference price in the valuation tab can be overridden by hand and is labelled as such.
- **Market-cap category is indicative.** SEBI/AMFI classify large / mid / small cap by *rank* (top 100 / next 150 / rest) and republish the list semi-annually. The app has no ranking universe, so it uses fixed ₹-crore thresholds defined in `lib/metrics.ts` (`MCAP_THRESHOLDS_CR`) that you can change.
- **Standalone vs consolidated, IFRS-style adjustments, leases, exceptional items, minority interests, associates** are not modelled; they are whatever you put in the columns. Decide the basis once per company and state it in `source` / `notes`.
- **Staleness.** The “possibly stale” flag compares the latest period end with today's date; it cannot know whether a newer filing exists.
- **Quarterly view.** Return ratios and leverage multiples are only computed on annual periods (quarterly figures are not annualised). Quarterly growth compares with the same quarter a year earlier.
- **Ratios.** ROE = net profit ÷ average of opening and closing equity (closing equity when no prior year); ROCE = (EBITDA − D&A, or PBT + finance costs) ÷ (total assets − current liabilities); free cash flow = CFO − capex; growth is “—” when the base value is not positive.

## Valuation methodology

**Comparables.** For each other company in the workspace the app computes P/E (market cap ÷ net profit), EV/EBITDA, EV/Sales (EV = market cap + borrowings − cash) and P/B (market cap ÷ equity) from its latest annual period; non-positive denominators give “NM” and are excluded. Selected peers' Q1 / median / Q3 are shown; the **median is applied by default and can be overridden**. Implied equity value = multiple × the company's metric (EV-based multiples subtract net debt); ÷ shares gives value per share.

**DCF.** Revenue growth fades linearly from the year-1 rate to the final-year rate; EBITDA margin moves linearly from the base-year margin to the terminal margin; D&A and capex are % of revenue; tax applies to positive EBIT; working-capital investment is a % of incremental revenue. FCFF is discounted at year-end WACC; terminal value uses Gordon growth on the final-year FCFF. Equity value = EV − net debt. WACC must exceed terminal growth, otherwise the scenario is flagged invalid.

**Starting assumptions are derived, not forecast.** Year-1 growth starts from the historical revenue CAGR (clamped 3–20 %); tax, D&A, capex and working-capital intensity come from the latest year (clamped); WACC 12 % and terminal growth 5 % are illustrative placeholders; bull / bear are a fixed spread around base (growth ±3 pp, margin ±2 pp, WACC ∓1 pp, terminal growth ±0.5 pp). The UI lists how each default was derived (“How the starting values were derived”). **Replace them with your own views.** Terminal value above 75 % of EV triggers a warning.

## Architecture

```
app/                 Next.js App Router shell (layout, page, error/not-found, global CSS)
components/
  Dashboard.tsx      client root: state, persistence, controls, tabs
  Overview.tsx  Financials.tsx  Valuation.tsx  ImportPanel.tsx
  PrintSummary.tsx   print-only layout (@media print)
  Provenance.tsx  CompanySearch.tsx  charts.tsx  ui.tsx
lib/
  types.ts           data model + field definitions (money stored as ₹ crore)
  csv.ts             RFC-4180 parser, validation, unit conversion, merge, export rows
  metrics.ts         growth, margins, returns, leverage, FCF, quality report
  valuation.ts       comps, DCF, scenarios, sensitivity, default derivation
  format.ts          Indian formatting (₹, lakh/crore, dates)
  export.ts          CSV downloads
  demo-csv.ts        GENERATED – demo dataset as a string (parsed by the same importer)
scripts/generate-demo.mjs   seeded generator for the synthetic demo + sample CSV
public/              demo-dataset.csv, sample-financials.csv
```

- Pure TypeScript logic in `lib/` has **no framework dependencies** and is separate from the UI.
- The demo dataset goes through the *same* importer and validator as user uploads.
- Charts use [Recharts](https://recharts.org). Series colours are CSS variables (`--s1…--s4`) taken from a colour-vision-deficiency-checked palette, with separately stepped dark-mode values. Every chart has a legend (≥ 2 series), tooltips, and a visually hidden data table for screen readers; the statement tables serve as the visible table view. Aqua/yellow fall below 3:1 contrast on the light surface, so meaning is never carried by colour alone (labels, legends, tooltips and tables always accompany marks).
- Accessibility: keyboard-operable combobox, tabs (arrow keys), segmented controls and tables; focus outlines; `aria-sort`, live regions for validation results; `prefers-reduced-motion` honoured.

### Regenerating the demo data

```bash
npm run generate:demo
```

This rewrites `public/demo-dataset.csv`, `public/sample-financials.csv` and `lib/demo-csv.ts`. Edit the `COMPANIES` array in `scripts/generate-demo.mjs` to change the fictional companies.

## Testing status of this deliverable

Read this before relying on the project:

- **Not done:** `npm install`, `next build`, `next dev` and a Vercel deployment were **not** run for this package (the authoring environment could not reach the npm registry). The Next.js/React/Recharts layer and its styling have therefore **not been compiled, launched or visually inspected**. Please run `npm install && npm run typecheck && npm run build` first and report/fix anything that surfaces.
- **Done:** the dependency-free `lib/` modules were type-checked with `tsc --strict` and exercised with a script (CSV parse/validate incl. error cases, lakh→crore conversion, export→import round trip, ratios, DCF, comps, sensitivity centre-cell equals base DCF). The React components were transpiled and **server-rendered** for all nine demo companies in annual and quarterly mode, all three display units, a sparse uploaded company, a no-peer case and an invalid-DCF case (with Recharts stubbed), and the HTML was scanned for `NaN` / `undefined` / `Infinity`. The component and app files were also type-checked with `tsc --strict` against *loose stand-in typings* for React and Recharts (which only catches mistakes in the project's own code – real `@types/react` and Recharts typings were not available). That checks logic and markup, not Recharts rendering, browser behaviour or layout.
- Dependency versions use caret ranges (`next ^14.2.25`, `react ^18.3.1`, `recharts ^2.15.0`) and no lockfile is included; `npm install` will create one.

## Disclaimer

Equity Lens India is an educational analysis tool. It is not a data vendor, research provider or investment adviser. Outputs are illustrative, depend on user-selected assumptions and user-supplied data, may contain errors, and are not a recommendation to buy, hold or sell any security. Verify figures against primary filings (company annual reports, NSE / BSE disclosures) and consult a SEBI-registered investment adviser before making decisions.
