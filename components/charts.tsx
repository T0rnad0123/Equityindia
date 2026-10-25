"use client";

import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from "recharts";
import { DASH } from "@/lib/format";

export interface ChartSeries {
  key: string;
  name: string;
  /** CSS colour, normally one of var(--s1)…var(--s4) */
  color: string;
  type?: "bar" | "line";
}

export type ChartRow = { label: string } & Record<string, number | string | null>;

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string | null }>;
  label?: string | number;
  series: ChartSeries[];
  format: (n: number) => string;
  suffix?: string;
}

function ChartTooltip({ active, payload, label, series, format, suffix }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tip" role="tooltip">
      <div className="tip-title">{label}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        const v = p && typeof p.value === "number" ? p.value : null;
        return (
          <div className="tip-row" key={s.key}>
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="tip-name">{s.name}</span>
            <span className="tip-val">{v === null ? DASH : `${format(v)}${suffix ?? ""}`}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Legend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="legend" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key}>
          <span className={s.type === "line" ? "swatch swatch-line" : "swatch"} style={{ background: s.color }} aria-hidden="true" />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Visually-hidden table so screen readers get the numbers the chart draws. */
function SrTable({ title, data, series, format }: { title: string; data: ChartRow[]; series: ChartSeries[]; format: (n: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th>Period</th>
          {series.map((s) => (
            <th key={s.key}>{s.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.label}>
            <th>{r.label}</th>
            {series.map((s) => {
              const v = r[s.key];
              return <td key={s.key}>{typeof v === "number" ? format(v) : "not available"}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const axisTick = { fill: "var(--muted)", fontSize: 12 };

export function ChartFrame({ title, subtitle, children, note }: { title: string; subtitle?: string; children: React.ReactNode; note?: string }) {
  return (
    <figure className="chart" aria-label={title}>
      <figcaption>
        <span className="chart-title">{title}</span>
        {subtitle && <span className="chart-sub">{subtitle}</span>}
      </figcaption>
      {children}
      {note && <p className="chart-note">{note}</p>}
    </figure>
  );
}

/** Bars and/or lines on ONE y-axis. */
export function TrendChart({
  title,
  subtitle,
  data,
  series,
  format,
  axisFormat,
  height = 250,
  suffix,
  note,
}: {
  title: string;
  subtitle?: string;
  data: ChartRow[];
  series: ChartSeries[];
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  height?: number;
  suffix?: string;
  note?: string;
}) {
  const hasAny = data.some((r) => series.some((s) => typeof r[s.key] === "number"));
  return (
    <ChartFrame title={title} subtitle={subtitle} note={note}>
      <Legend series={series} />
      {!hasAny ? (
        <div className="chart-empty" style={{ height }}>
          No data available for this selection.
        </div>
      ) : (
        <>
          <div style={{ height }} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval="preserveStartEnd" />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={axisFormat ?? format} />
                <Tooltip
                  cursor={{ fill: "var(--hover)" }}
                  content={<ChartTooltip series={series} format={format} suffix={suffix} />}
                  isAnimationActive={false}
                />
                {series.map((s) =>
                  s.type === "line" ? (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ) : (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.name}
                      fill={s.color}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={34}
                      isAnimationActive={false}
                    />
                  )
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <SrTable title={title} data={data} series={series} format={format} />
        </>
      )}
    </ChartFrame>
  );
}

/** Tiny line with no axes, for KPI cards. Values may contain nulls (gaps). */
export function Spark({ values, label }: { values: (number | null)[]; label: string }) {
  const data = values.map((v, i) => ({ i, v }));
  if (values.filter((v) => v !== null).length < 2) return <div className="spark spark-empty" aria-hidden="true" />;
  return (
    <div className="spark" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line type="monotone" dataKey="v" stroke="var(--s1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Valuation range ("football field") ---------- */

export interface RangeRow {
  label: string;
  low: number;
  mid: number;
  high: number;
}

function RangeTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: RangeRow }> }) {
  if (!active || !payload || !payload.length || !payload[0].payload) return null;
  const r = payload[0].payload;
  const f = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;
  return (
    <div className="tip" role="tooltip">
      <div className="tip-title">{r.label}</div>
      <div className="tip-row"><span className="tip-name">Low</span><span className="tip-val">{f(r.low)}</span></div>
      <div className="tip-row"><span className="tip-name">Mid</span><span className="tip-val">{f(r.mid)}</span></div>
      <div className="tip-row"><span className="tip-name">High</span><span className="tip-val">{f(r.high)}</span></div>
    </div>
  );
}

export function RangeChart({ rows, price }: { rows: RangeRow[]; price: number | null }) {
  const data = rows.map((r) => ({ ...r, base: r.low, span: Math.max(r.high - r.low, 0.0001) }));
  const height = rows.length * 46 + 44;
  return (
    <ChartFrame title="Implied value per share by method" subtitle="₹ per share · bars show low–high; dashed line is the reference price">
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }} barCategoryGap={12}>
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" domain={[0, (max: number) => Math.ceil(max * 1.1)]} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} tickFormatter={(n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`} />
            <YAxis type="category" dataKey="label" width={170} tick={{ fill: "var(--text2)", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip content={<RangeTooltip />} cursor={{ fill: "var(--hover)" }} isAnimationActive={false} />
            <Bar dataKey="base" stackId="r" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="span" stackId="r" fill="var(--s1)" radius={4} maxBarSize={20} isAnimationActive={false} />
            {price !== null && <ReferenceLine x={price} stroke="var(--text2)" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "Price", position: "top", fill: "var(--text2)", fontSize: 12 }} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Implied value per share by method</caption>
        <thead><tr><th>Method</th><th>Low</th><th>Mid</th><th>High</th></tr></thead>
        <tbody>{rows.map((r) => (<tr key={r.label}><th>{r.label}</th><td>{r.low.toFixed(0)}</td><td>{r.mid.toFixed(0)}</td><td>{r.high.toFixed(0)}</td></tr>))}</tbody>
      </table>
    </ChartFrame>
  );
}
