"use client";

import type { EnumFilterDef, FilterConfig, FilterDef, FilterValue, FilterValues, RangeFilterDef, RangeValue } from "@/lib/config/schema";
import { describeRange, formatUnit } from "@/lib/format";

interface Props {
  config: FilterConfig;
  values: FilterValues;
  onChange: (id: string, value: FilterValue) => void;
  onReset: () => void;
}

/** Rendered entirely from config/filters.json — a new filter entry shows up here automatically. */
export function FilterPanel({ config, values, onChange, onReset }: Props) {
  const groups = new Map<string, FilterDef[]>();
  for (const f of config.filters) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-text">Filters</h2>
        <button type="button" onClick={onReset} className="text-xs text-muted hover:text-text">
          Reset
        </button>
      </div>
      {[...groups].map(([group, filters]) => {
        const ranges = filters.filter((f) => f.type === "range" || f.type === "enum");
        const toggles = filters.filter((f) => f.type === "bool" || f.type === "llm_tag");
        return (
          <section key={group} className="flex flex-col gap-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">{group}</h3>
            {ranges.map((f) =>
              f.type === "range" ? (
                <RangeControl key={f.id} filter={f} value={values[f.id] as RangeValue} currency={config.currency} onChange={(v) => onChange(f.id, v)} />
              ) : (
                <EnumControl key={f.id} filter={f as EnumFilterDef} value={values[f.id] as string | null} onChange={(v) => onChange(f.id, v)} />
              ),
            )}
            {toggles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {toggles.map((f) => (
                  <ToggleChip key={f.id} filter={f} active={values[f.id] === true} onToggle={() => onChange(f.id, values[f.id] !== true)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FilterBadge({ filter }: { filter: FilterDef }) {
  if (filter.hard) {
    return <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">must</span>;
  }
  return (
    <span className="text-[10px] text-muted" title={`Weight ${filter.weight}`}>
      {"●".repeat(Math.max(1, Math.round((filter.weight ?? 0) * 3)))}
    </span>
  );
}

function RangeControl({
  filter,
  value,
  currency,
  onChange,
}: {
  filter: RangeFilterDef;
  value: RangeValue;
  currency: string;
  onChange: (v: RangeValue) => void;
}) {
  const v = value ?? { min: null, max: null };
  const minPos = v.min ?? filter.min;
  const maxPos = v.max ?? filter.max;
  const setMin = (n: number) => {
    const min = n <= filter.min ? null : n;
    onChange({ min, max: v.max !== null && min !== null && min > v.max ? min : v.max });
  };
  const setMax = (n: number) => {
    const max = n >= filter.max ? null : n;
    onChange({ min: v.min !== null && max !== null && max < v.min ? max : v.min, max });
  };
  const active = v.min !== null || v.max !== null;

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-text" htmlFor={`${filter.id}-max`}>
          {filter.label} <FilterBadge filter={filter} />
        </label>
        <span className={`text-xs tabular-nums ${active ? "text-accent" : "text-muted"}`}>{describeRange(filter, v, currency)}</span>
      </div>
      <div className="grid grid-cols-[2.25rem_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span>Min</span>
        <input
          id={`${filter.id}-min`}
          aria-label={`${filter.label} minimum`}
          type="range"
          min={filter.min}
          max={filter.max}
          step={filter.step}
          value={minPos}
          onChange={(e) => setMin(Number(e.target.value))}
        />
        <span>Max</span>
        <input
          id={`${filter.id}-max`}
          aria-label={`${filter.label} maximum`}
          type="range"
          min={filter.min}
          max={filter.max}
          step={filter.step}
          value={maxPos}
          onChange={(e) => setMax(Number(e.target.value))}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{formatUnit(filter.min, filter.unit, currency)}</span>
        {active && (
          <button type="button" className="hover:text-text" onClick={() => onChange({ min: null, max: null })}>
            clear
          </button>
        )}
        <span>
          {formatUnit(filter.max, filter.unit, currency)}
          {filter.unit === "★" ? "" : "+"}
        </span>
      </div>
    </div>
  );
}

function EnumControl({ filter, value, onChange }: { filter: EnumFilterDef; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-sm text-text">
        {filter.label} <FilterBadge filter={filter} />
      </span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={filter.label}>
        {[{ value: null, label: "Any" }, ...filter.options].map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value ?? "any"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selected ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleChip({ filter, active, onToggle }: { filter: FilterDef; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      title={filter.description ?? (filter.type === "llm_tag" ? "Derived from descriptions and reviews" : undefined)}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
        active ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2 text-muted hover:text-text"
      }`}
    >
      {filter.type === "llm_tag" && <span aria-hidden>✦</span>}
      {filter.label}
      {filter.hard && <span className="text-[10px] text-warn">must</span>}
    </button>
  );
}
