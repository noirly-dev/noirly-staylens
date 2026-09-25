import { z } from "zod";
import { rangeValueSchema, type FilterConfig, type FilterDef, type FilterValue, type FilterValues } from "./schema";

/** Zod schema for the value a single filter accepts, derived from its definition. */
export function valueSchemaFor(filter: FilterDef): z.ZodType<FilterValue> {
  switch (filter.type) {
    case "range":
      return rangeValueSchema.refine((v) => v.min === null || v.max === null || v.min <= v.max, {
        message: "min must be <= max",
      });
    case "bool":
    case "llm_tag":
      return z.boolean();
    case "enum": {
      const values = filter.options.map((o) => o.value) as [string, ...string[]];
      return z.enum(values).nullable();
    }
  }
}

/** Strict schema for a (partial) filter-values object. Unknown filter ids are rejected. */
export function buildFilterValuesSchema(config: FilterConfig) {
  const shape: Record<string, z.ZodType<FilterValue | undefined>> = {};
  for (const f of config.filters) shape[f.id] = valueSchemaFor(f).optional();
  return z.strictObject(shape);
}

export function defaultFilterValues(config: FilterConfig): FilterValues {
  return Object.fromEntries(config.filters.map((f) => [f.id, structuredClone(f.default)]));
}

/** Validate a partial values object and fill in defaults for every filter not provided. */
export function resolveFilterValues(config: FilterConfig, input: unknown): FilterValues {
  const parsed = buildFilterValuesSchema(config).parse(input ?? {});
  const values = defaultFilterValues(config);
  for (const [id, v] of Object.entries(parsed)) if (v !== undefined) values[id] = v;
  return values;
}
