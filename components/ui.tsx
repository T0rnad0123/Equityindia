"use client";

import React, { useEffect, useId, useRef, useState } from "react";

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? "seg-btn on" : "seg-btn"}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Tabs (WAI-ARIA tab pattern with arrow keys) ---------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  variant = "main",
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  variant?: "main" | "sub";
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].value);
      refs.current[tabs[next].value]?.focus();
    }
  };
  return (
    <div className={`tabs tabs-${variant}`} role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[t.value] = el;
          }}
          role="tab"
          type="button"
          id={`tab-${variant}-${t.value}`}
          aria-selected={t.value === value}
          aria-controls={`panel-${variant}-${t.value}`}
          tabIndex={t.value === value ? 0 : -1}
          className={t.value === value ? "tab on" : "tab"}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, variant = "main", children }: { id: string; variant?: "main" | "sub"; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${variant}-${id}`} aria-labelledby={`tab-${variant}-${id}`} className="tabpanel" tabIndex={-1}>
      {children}
    </div>
  );
}

/* ---------- Small atoms ---------- */

export function Badge({ tone = "neutral", children, title }: { tone?: "neutral" | "accent" | "warn" | "good" | "bad"; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: "info" | "warn" | "error" | "good";
  title?: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
}) {
  const icon = tone === "error" ? "✕" : tone === "warn" ? "!" : tone === "good" ? "✓" : "i";
  return (
    <div className={`callout callout-${tone}`} role={role}>
      <span className="callout-icon" aria-hidden="true">{icon}</span>
      <div>
        {title && <strong className="callout-title">{title}</strong>}
        {children && <div className="callout-body">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">◌</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function Card({ title, subtitle, actions, children, className = "" }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- Numeric input with draft text (so typing "1." or "" never fights the model) ---------- */

export function NumField({
  label,
  value,
  onChange,
  percent = false,
  suffix,
  step = 1,
  min,
  max,
  hint,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Value is a fraction; the user types percent points. */
  percent?: boolean;
  suffix?: string;
  step?: number;
  /** min / max are in the units the user types (percent points when percent=true). */
  min?: number;
  max?: number;
  hint?: string;
  compact?: boolean;
}) {
  const id = useId();
  const toText = (v: number) => String(Number((percent ? v * 100 : v).toFixed(4)));
  const [draft, setDraft] = useState(toText(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(toText(value));
  }, [value, percent]);

  const parse = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (min !== undefined && n < min) return null;
    if (max !== undefined && n > max) return null;
    return n;
  };
  const invalid = parse(draft) === null;
  const unit = suffix ?? (percent ? "%" : "");

  return (
    <div className={compact ? "field field-compact" : "field"}>
      <label htmlFor={id}>{label}</label>
      <div className={invalid ? "input-wrap invalid" : "input-wrap"}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={draft}
          aria-invalid={invalid}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            setDraft(toText(value));
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parse(e.target.value);
            if (n !== null) onChange(percent ? n / 100 : n);
          }}
        />
        {unit && <span className="input-suffix">{unit}</span>}
      </div>
      {invalid ? (
        <span className="field-hint err" id={`${id}-hint`}>
          Enter a number{min !== undefined ? ` ≥ ${min}` : ""}{max !== undefined ? ` ≤ ${max}` : ""}.
        </span>
      ) : (
        hint && (
          <span className="field-hint" id={`${id}-hint`}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
