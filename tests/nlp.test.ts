import { describe, expect, it } from "vitest";
import { getFilterConfig } from "@/lib/config";
import { parseQueryHeuristic, sanitizeParsedFilters } from "@/lib/nlp";
import { buildParseSchema, compactParsed, describeFilters } from "@/lib/nlp/llm";

const config = getFilterConfig();

describe("heuristic query parser", () => {
  it("parses the canonical example", () => {
    const r = parseQueryHeuristic("pool villa under 8k, 3hr from Bangalore, quiet", config);
    expect(r.originText).toBe("Bangalore");
    expect(r.filters).toMatchObject({
      price_per_night: { min: null, max: 8000 },
      drive_time: { min: null, max: 180 },
      pool: true,
      private_pool: true,
      stay_type: "villa",
      quiet: true,
    });
  });

  it("handles ranges, minutes, ratings and negation", () => {
    const r = parseQueryHeuristic("homestay between 3k and 6k within 90 mins of home, 4.5+ rated, no pets, near Mysore", config);
    expect(r.filters.price_per_night).toEqual({ min: 3000, max: 6000 });
    expect(r.filters.drive_time).toEqual({ min: null, max: 90 });
    expect(r.filters.rating).toEqual({ min: 4.5, max: null });
    expect(r.filters.stay_type).toBe("homestay");
    expect(r.filters.pet_friendly).toBeUndefined();
    expect(r.originText).toBe("Mysore");
  });

  it("parses currency-prefixed and 'over' amounts", () => {
    expect(parseQueryHeuristic("resort over ₹5000", config).filters.price_per_night).toEqual({ min: 5000, max: null });
    expect(parseQueryHeuristic("rs 4,500 max", config).filters.price_per_night).toEqual({ min: null, max: 4500 });
    expect(parseQueryHeuristic("something for 10k", config).filters.price_per_night).toEqual({ min: null, max: 10000 });
  });

  it("returns nothing for unrelated text", () => {
    expect(parseQueryHeuristic("hello there", config)).toEqual({ filters: {}, originText: null });
  });
});

describe("parse output handling", () => {
  it("sanitizes against config: drops unknown ids, clamps ranges, drops invalid values", () => {
    const out = sanitizeParsedFilters(config, {
      drive_time: { min: null, max: 9999 },
      bogus: true,
      stay_type: "castle",
      quiet: true,
    });
    expect(out).toEqual({ drive_time: { min: null, max: 480 }, quiet: true });
  });

  it("compacts nulls and false booleans", () => {
    expect(compactParsed({ a: null, b: false, c: true, d: { min: null, max: null }, e: { min: 1, max: null }, f: "x" })).toEqual({
      c: true,
      e: { min: 1, max: null },
      f: "x",
    });
  });

  it("builds an LLM output schema and description covering every filter", () => {
    const schema = buildParseSchema(config);
    const sample = Object.fromEntries(config.filters.map((f) => [f.id, null]));
    expect(schema.safeParse({ origin: null, filters: sample }).success).toBe(true);
    const text = describeFilters(config);
    for (const f of config.filters) expect(text).toContain(f.id);
  });
});
