import raw from "@/config/filters.json";
import { filterConfigSchema, type FilterConfig } from "./schema";

export * from "./schema";
export * from "./values";

export function parseFilterConfig(input: unknown): FilterConfig {
  const result = filterConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid filter config:\n${result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return result.data;
}

let cached: FilterConfig | undefined;

/** The validated app filter config (config/filters.json). Throws on invalid config. */
export function getFilterConfig(): FilterConfig {
  cached ??= parseFilterConfig(raw);
  return cached;
}
