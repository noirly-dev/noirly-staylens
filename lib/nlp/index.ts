import { buildFilterValuesSchema, type FilterConfig, type FilterValues, type FilterDef } from "@/lib/config";
import type { ParsedQuery } from "./heuristic";

export * from "./heuristic";

/**
 * Validate parser output against config: unknown ids are dropped, range values are clamped to
 * the filter's bounds, and anything that still fails validation is discarded per filter.
 */
export function sanitizeParsedFilters(config: FilterConfig, filters: FilterValues): FilterValues {
  const byId = new Map<string, FilterDef>(config.filters.map((f) => [f.id, f]));
  const schema = buildFilterValuesSchema(config);
  const out: FilterValues = {};
  for (const [id, value] of Object.entries(filters)) {
    const def = byId.get(id);
    if (!def) continue;
    let v = value;
    if (def.type === "range" && v && typeof v === "object") {
      const clamp = (n: number | null) => (n === null ? null : Math.min(def.max, Math.max(def.min, n)));
      v = { min: clamp(v.min), max: clamp(v.max) };
    }
    if (schema.safeParse({ [id]: v }).success) out[id] = v;
  }
  return out;
}

export type { ParsedQuery };
