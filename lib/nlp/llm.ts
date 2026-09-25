import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { FilterConfig, FilterDef, FilterValues } from "@/lib/config/schema";
import type { ParsedQuery } from "./heuristic";

function outputSchemaFor(f: FilterDef): z.ZodType {
  switch (f.type) {
    case "range":
      return z.object({ min: z.number().nullable(), max: z.number().nullable() }).nullable();
    case "bool":
    case "llm_tag":
      return z.boolean().nullable();
    case "enum":
      return z.enum(f.options.map((o) => o.value) as [string, ...string[]]).nullable();
  }
}

export function buildParseSchema(config: FilterConfig) {
  return z.object({
    origin: z.string().nullable().describe("Starting city/place the user will travel from, if mentioned"),
    filters: z.object(Object.fromEntries(config.filters.map((f) => [f.id, outputSchemaFor(f)]))),
  });
}

export function describeFilters(config: FilterConfig): string {
  return config.filters
    .map((f) => {
      const parts = [`- ${f.id} (${f.type}): ${f.label}`];
      if (f.description) parts.push(f.description);
      if (f.type === "range") parts.push(`number in ${f.unit ?? "units"}, allowed ${f.min}–${f.max}`);
      if (f.type === "enum") parts.push(`one of: ${f.options.map((o) => `${o.value} (${o.label})`).join(", ")}`);
      return parts.join(". ");
    })
    .join("\n");
}

const SYSTEM = (config: FilterConfig) => `You convert a traveller's free-text request for a stay into structured search filters.
Prices are per night in ${config.currency}; "8k" means 8000. Durations for drive time are in minutes; "3hr" means 180.
Set a filter only when the request clearly asks for it; leave every other filter null. For range filters,
"under X" sets max, "over X" sets min. Set a boolean filter to true only if the traveller wants that attribute.

Filters:
${describeFilters(config)}`;

/** Drop nulls and falsy booleans so only filters the user asked for are returned. */
export function compactParsed(filters: Record<string, unknown>): FilterValues {
  const out: FilterValues = {};
  for (const [id, v] of Object.entries(filters)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "object" && (v as { min: unknown }).min === null && (v as { max: unknown }).max === null) continue;
    out[id] = v as FilterValues[string];
  }
  return out;
}

export async function parseQueryLlm(text: string, config: FilterConfig, client: Anthropic, model: string): Promise<ParsedQuery> {
  const response = await client.messages.parse({
    model,
    max_tokens: 2048,
    system: SYSTEM(config),
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(buildParseSchema(config)) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`query parse returned no structured output (stop_reason=${response.stop_reason})`);
  }
  const parsed = response.parsed_output as { origin: string | null; filters: Record<string, unknown> };
  return { filters: compactParsed(parsed.filters), originText: parsed.origin };
}
