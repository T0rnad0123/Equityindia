import { companyToImportRows, toCsv } from "./csv";
import { DisplayUnit } from "./format";
import { Company } from "./types";
import { SCENARIO_KEYS, SCENARIO_LABEL, ValState, Valuation, upside } from "./valuation";

export function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "export";
}

/** Browser-only: trigger a file download from a string. */
export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["﻿" + content], { type: mime }); // BOM so Excel opens ₹ and UTF-8 correctly
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Financial data in the same schema as the import format (values in INR crore) – re-importable. */
export function buildFinancialsCsv(c: Company): string {
  return toCsv(companyToImportRows(c));
}

const PCT = (x: number) => Number((x * 100).toFixed(4));
const DISCLAIMER =
  "Valuation outputs depend entirely on user-selected assumptions and peer choices. They are illustrative, not investment advice, and not a recommendation to buy or sell any security.";

/** Valuation assumptions + results as one long-format CSV: section,item,scenario,value,unit,note */
export function buildValuationCsv(c: Company, v: Valuation, st: ValState, displayUnit: DisplayUnit, dataOrigin: string): string {
  const rows: (string | number | null)[][] = [["section", "item", "scenario", "value", "unit", "note"]];
  const add = (section: string, item: string, scenario: string, value: string | number | null, unit = "", note = "") =>
    rows.push([section, item, scenario, value, unit, note]);

  add("meta", "company", "", c.name);
  add("meta", "ticker", "", c.ticker);
  add("meta", "exchange", "", c.exchange);
  add("meta", "sector", "", c.sector);
  add("meta", "data_origin", "", dataOrigin);
  add("meta", "generated_at", "", new Date().toISOString());
  add("meta", "display_unit_in_ui", "", displayUnit);
  add("meta", "money_unit_in_this_file", "", "INR crore unless stated");
  add("meta", "disclaimer", "", DISCLAIMER);
  add("price", "reference_price", "", v.price, "INR per share", v.priceIsOverride ? "user override" : v.priceDate ? `dataset snapshot as of ${v.priceDate}` : "dataset snapshot (undated)");

  const s = st.shared;
  add("assumption_shared", "forecast_years", "", s.years, "years");
  add("assumption_shared", "tax_rate", "", PCT(s.taxRate), "%");
  add("assumption_shared", "da_pct_revenue", "", PCT(s.daPct), "%");
  add("assumption_shared", "capex_pct_revenue", "", PCT(s.capexPct), "%");
  add("assumption_shared", "nwc_pct_incremental_revenue", "", PCT(s.nwcPct), "%");
  add("assumption_shared", "base_revenue", "", s.baseRevenue, "INR crore");
  add("assumption_shared", "base_ebitda_margin", "", PCT(s.baseMargin), "%");
  add("assumption_shared", "net_debt", "", s.netDebt, "INR crore");
  add("assumption_shared", "shares_outstanding", "", s.shares, "crore shares");

  for (const k of SCENARIO_KEYS) {
    const sc = st.scenarios[k];
    const L = SCENARIO_LABEL[k];
    add("assumption_scenario", "revenue_growth_year1", L, PCT(sc.growthStart), "%");
    add("assumption_scenario", "revenue_growth_final_year", L, PCT(sc.growthEnd), "%");
    add("assumption_scenario", "terminal_ebitda_margin", L, PCT(sc.ebitdaMargin), "%");
    add("assumption_scenario", "wacc", L, PCT(sc.wacc), "%");
    add("assumption_scenario", "terminal_growth", L, PCT(sc.terminalGrowth), "%");
  }

  for (const k of SCENARIO_KEYS) {
    const r = v.dcf[k];
    const L = SCENARIO_LABEL[k];
    if (!r.valid) {
      add("dcf_result", "status", L, "invalid", "", r.reason ?? "");
      continue;
    }
    add("dcf_result", "enterprise_value", L, r.ev, "INR crore");
    add("dcf_result", "equity_value", L, r.equity, "INR crore");
    add("dcf_result", "value_per_share", L, r.perShare, "INR");
    const up = upside(r.perShare, v.price);
    add("dcf_result", "upside_vs_reference_price", L, up === null ? null : PCT(up), "%");
    add("dcf_result", "terminal_value_share_of_ev", L, PCT(r.terminalShare), "%");
  }

  const base = v.dcf[st.active];
  if (base.valid) {
    for (const y of base.years) {
      add("dcf_projection", `year_${y.year}_revenue`, SCENARIO_LABEL[st.active], y.revenue, "INR crore");
      add("dcf_projection", `year_${y.year}_ebitda`, SCENARIO_LABEL[st.active], y.ebitda, "INR crore");
      add("dcf_projection", `year_${y.year}_fcff`, SCENARIO_LABEL[st.active], y.fcff, "INR crore");
      add("dcf_projection", `year_${y.year}_pv_fcff`, SCENARIO_LABEL[st.active], y.pv, "INR crore");
    }
  }

  for (const cl of v.comps) {
    add("comps_multiple", `${cl.label}_peer_count`, "", cl.stats.n);
    add("comps_multiple", `${cl.label}_peer_q1`, "", cl.stats.q1, "x");
    add("comps_multiple", `${cl.label}_peer_median`, "", cl.stats.median, "x");
    add("comps_multiple", `${cl.label}_peer_q3`, "", cl.stats.q3, "x");
    add("comps_multiple", `${cl.label}_applied`, "", cl.used, "x", cl.overridden ? "user override" : "peer median");
    add("comps_result", `${cl.label}_value_per_share_low`, "", cl.low, "INR");
    add("comps_result", `${cl.label}_value_per_share_mid`, "", cl.mid, "INR");
    add("comps_result", `${cl.label}_value_per_share_high`, "", cl.high, "INR");
  }

  for (const p of v.peers) {
    const included = v.selectedPeers.some((x) => x.ticker === p.ticker);
    add("peer", p.ticker, "", included ? "included" : "excluded", "", `${p.name}; ${p.sector}; mcap ${p.mcap === null ? "n/a" : p.mcap.toFixed(0)} INR crore; P/E ${p.pe?.toFixed(1) ?? "n/a"}; EV/EBITDA ${p.evEbitda?.toFixed(1) ?? "n/a"}; EV/Sales ${p.evSales?.toFixed(2) ?? "n/a"}; P/B ${p.pb?.toFixed(2) ?? "n/a"}`);
  }

  for (const g of [v.sensitivityA, v.sensitivityB]) {
    g.rows.forEach((rv, i) =>
      g.cols.forEach((cv, j) =>
        add("sensitivity", `${g.rowLabel}=${(rv * 100).toFixed(2)}% | ${g.colLabel}=${(cv * 100).toFixed(2)}%`, SCENARIO_LABEL[st.active], g.cells[i][j], "INR per share")
      )
    );
  }
  return toCsv(rows);
}
