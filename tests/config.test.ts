import { describe, expect, it } from "vitest";
import { buildFilterValuesSchema, defaultFilterValues, getFilterConfig, parseFilterConfig, resolveFilterValues } from "@/lib/config";
import { boolFilter, makeConfig, rangeFilter } from "./helpers";

describe("filter config", () => {
  it("app config/filters.json is valid", () => {
    const config = getFilterConfig();
    expect(config.filters.length).toBeGreaterThan(5);
    expect(config.search.maxRateFetches).toBeLessThanOrEqual(25);
  });

  it("applies defaults", () => {
    const c = makeConfig([boolFilter()]);
    expect(c.currency).toBe("INR");
    expect(c.filters[0]).toMatchObject({ hard: false, default: false, matchOn: ["amenities", "tags"], group: "Other" });
  });

  it.each([
    ["hard with weight", [boolFilter({ hard: true, weight: 0.5 })], /must not set a weight/],
    ["soft without weight", [boolFilter({ weight: undefined })], /need a weight/],
    ["duplicate ids", [boolFilter(), boolFilter()], /duplicate filter id/],
    ["bad id", [boolFilter({ id: "Bad-Id" })], /snake_case/],
    ["min >= max", [rangeFilter({ min: 10, max: 10 })], /min must be < max/],
    ["field/source mismatch", [rangeFilter({ source: "places" })], /comes from source "rates"/],
    ["llm_tag not from enrichment", [{ id: "q", label: "Q", type: "llm_tag", source: "places", weight: 1 }], /source/],
    ["unknown type", [{ id: "q", label: "Q", type: "slider", source: "places", weight: 1 }], /type/],
    [
      "enum duplicate options",
      [{ id: "e", label: "E", type: "enum", source: "places", weight: 1, options: [{ value: "a", label: "A" }, { value: "a", label: "A2" }] }],
      /duplicate option/,
    ],
    [
      "enum bad default",
      [{ id: "e", label: "E", type: "enum", source: "places", weight: 1, default: "z", options: [{ value: "a", label: "A" }] }],
      /default is not an option/,
    ],
  ])("rejects %s", (_name, filters, message) => {
    expect(() => parseFilterConfig({ version: 1, filters })).toThrow(message);
  });

  it("builds a strict values schema from config", () => {
    const c = makeConfig([rangeFilter(), boolFilter()]);
    const schema = buildFilterValuesSchema(c);
    expect(schema.safeParse({ price: { min: 1, max: 2 }, pool: true }).success).toBe(true);
    expect(schema.safeParse({ price: { min: 5, max: 2 } }).success).toBe(false);
    expect(schema.safeParse({ pool: "yes" }).success).toBe(false);
    expect(schema.safeParse({ nope: true }).success).toBe(false);
  });

  it("resolves partial values over defaults", () => {
    const c = makeConfig([rangeFilter({ default: { max: 9000 } }), boolFilter()]);
    expect(defaultFilterValues(c)).toEqual({ price: { min: null, max: 9000 }, pool: false });
    expect(resolveFilterValues(c, { pool: true })).toEqual({ price: { min: null, max: 9000 }, pool: true });
    expect(resolveFilterValues(c, undefined)).toEqual({ price: { min: null, max: 9000 }, pool: false });
  });
});
