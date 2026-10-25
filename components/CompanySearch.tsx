"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Company } from "@/lib/types";
import { Badge } from "./ui";

export function CompanySearch({
  companies,
  selected,
  onSelect,
}: {
  companies: Company[];
  selected: string | null;
  onSelect: (ticker: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? companies.filter((c) => `${c.name} ${c.ticker} ${c.sector} ${c.exchange}`.toLowerCase().includes(q))
      : companies;
    return list.slice(0, 50);
  }, [companies, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (c: Company) => {
    onSelect(c.ticker);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        choose(matches[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const current = companies.find((c) => c.ticker === selected);

  return (
    <div className="search" ref={wrap}>
      <label htmlFor={`${id}-in`} className="sr-only">Search company by name, ticker or sector</label>
      <input
        id={`${id}-in`}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-opt-${active}` : undefined}
        type="search"
        autoComplete="off"
        placeholder={current ? `${current.name} · change company…` : "Search company, ticker or sector…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="search-list">
          {matches.length === 0 && <li className="search-empty" role="option" aria-selected="false">No company matches “{query}”. Import a CSV to add it.</li>}
          {matches.map((c, i) => (
            <li
              key={c.ticker}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={c.ticker === selected}
              className={i === active ? "search-opt active" : "search-opt"}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
            >
              <span className="search-main">
                <strong>{c.name}</strong>
                <span className="muted">{c.ticker} · {c.exchange} · {c.sector}</span>
              </span>
              <Badge tone={c.origin === "demo" ? "warn" : "accent"}>{c.origin === "demo" ? "Demo" : "Uploaded"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
