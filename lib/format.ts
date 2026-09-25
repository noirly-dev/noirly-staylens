import type { FilterDef, FilterValue, RangeFilterDef } from "@/lib/config/schema";

export function formatMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatUnit(n: number, unit: string | undefined, currency: string): string {
  if (unit === currency) return formatMoney(n, currency);
  if (unit === "min") return formatDuration(n);
  if (unit === "★") return `${n.toFixed(1)}★`;
  return unit ? `${n.toLocaleString("en-IN")} ${unit}` : n.toLocaleString("en-IN");
}

export function describeRange(filter: RangeFilterDef, value: { min: number | null; max: number | null }, currency: string): string {
  const f = (n: number) => formatUnit(n, filter.unit, currency);
  if (value.min !== null && value.max !== null) return `${f(value.min)} – ${f(value.max)}`;
  if (value.max !== null) return `≤ ${f(value.max)}`;
  if (value.min !== null) return `≥ ${f(value.min)}`;
  return "Any";
}

/** Short human label for an active filter value, e.g. "Price per night ≤ ₹8,000". */
export function describeFilterValue(filter: FilterDef, value: FilterValue, currency: string): string {
  if (filter.type === "range" && value && typeof value === "object") return `${filter.label} ${describeRange(filter, value, currency)}`;
  if (filter.type === "enum") return filter.options.find((o) => o.value === value)?.label ?? filter.label;
  return filter.label;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Next Friday → Sunday, in UTC dates. */
export function defaultStayDates(now = new Date()): { checkIn: string; checkOut: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const offset = (5 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + offset);
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + 2);
  return { checkIn: toIsoDate(d), checkOut: toIsoDate(out) };
}
