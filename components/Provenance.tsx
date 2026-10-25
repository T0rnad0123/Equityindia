"use client";

import React from "react";
import { Company, Period, PeriodType } from "@/lib/types";
import { fmtDate, monthsBetween } from "@/lib/format";
import { latestMarket } from "@/lib/metrics";
import { Badge, Callout } from "./ui";

export interface Freshness {
  tone: "demo" | "ok" | "stale" | "unknown";
  text: string;
}

export function computeFreshness(c: Company, periods: Period[], today: string): Freshness {
  if (c.origin === "demo") return { tone: "demo", text: "Synthetic demo data – not real, not live" };
  const last = periods[periods.length - 1];
  if (!last) return { tone: "unknown", text: "No periods in range" };
  const age = monthsBetween(last.periodEnd, today);
  if (age > 15) return { tone: "stale", text: `Latest period ended ${fmtDate(last.periodEnd)} (${age} months ago) – may be stale` };
  return { tone: "ok", text: `Latest period ended ${fmtDate(last.periodEnd)}` };
}

export function Provenance({
  company,
  periods,
  periodType,
  today,
}: {
  company: Company;
  periods: Period[];
  periodType: PeriodType;
  today: string;
}) {
  const sources = Array.from(new Set(periods.map((p) => p.source.trim() || "source not stated")));
  const urls = Array.from(new Set(periods.map((p) => p.sourceUrl).filter(Boolean)));
  const updated = periods.map((p) => p.lastUpdated).filter(Boolean).sort();
  const lastUpdated = updated[updated.length - 1];
  const first = periods[0];
  const last = periods[periods.length - 1];
  const fresh = computeFreshness(company, periods, today);
  const mk = latestMarket(company);
  const restated = periods.filter((p) => p.restated);

  return (
    <section className="prov" aria-label="Data provenance">
      {company.origin === "demo" && (
        <Callout tone="warn" title="Demo dataset – fictional companies, synthetic numbers" role="status">
          Everything shown for {company.name} is generated sample data so the dashboard works out of the box. It is not real, not live, and
          not derived from any actual filing. Import your own CSV on the <strong>Data &amp; import</strong> tab to analyse real companies.
        </Callout>
      )}
      {fresh.tone === "stale" && (
        <Callout tone="warn" title="Data may be out of date" role="status">
          {fresh.text}. This app does not refresh data automatically – update your CSV from the latest filing.
        </Callout>
      )}
      <dl className="prov-grid">
        <div>
          <dt>Source</dt>
          <dd>
            {sources.map((s, i) => (
              <span key={s}>{i > 0 && "; "}{s}</span>
            ))}
            {urls.slice(0, 3).map((u) => (
              <React.Fragment key={u}>
                {" "}
                <a href={u} target="_blank" rel="noopener noreferrer">link</a>
              </React.Fragment>
            ))}
          </dd>
        </div>
        <div>
          <dt>Reporting basis</dt>
          <dd>
            {periodType === "annual" ? "Annual" : "Quarterly"}
            {first && last ? ` · ${first.label} to ${last.label}` : ""}
            <span className="muted"> · fiscal year ends 31 March unless period end says otherwise</span>
          </dd>
        </div>
        <div>
          <dt>Currency &amp; units</dt>
          <dd>INR · stored in ₹ crore (converted on import from the unit declared in the file)</dd>
        </div>
        <div>
          <dt>Last updated (as stated in file)</dt>
          <dd>{lastUpdated ? fmtDate(lastUpdated) : "not stated"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Badge tone={fresh.tone === "demo" ? "warn" : fresh.tone === "stale" ? "warn" : fresh.tone === "ok" ? "good" : "neutral"}>
              {fresh.tone === "demo" ? "Demo · synthetic" : fresh.tone === "stale" ? "Possibly stale" : fresh.tone === "ok" ? "User-supplied" : "Unknown"}
            </Badge>{" "}
            <span className="muted">{fresh.text}</span>
          </dd>
        </div>
        <div>
          <dt>Share price</dt>
          <dd>
            {mk.price !== null ? `Snapshot ${mk.priceDate ? "as of " + fmtDate(mk.priceDate) : "(undated)"} – supplied in the file, not a live quote` : "none supplied – market cap and multiples unavailable"}
          </dd>
        </div>
        {restated.length > 0 && (
          <div>
            <dt>Restated periods</dt>
            <dd>{restated.map((p) => p.label).join(", ")} – flagged “R” in the tables; earlier-year comparisons may not be like-for-like.</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
