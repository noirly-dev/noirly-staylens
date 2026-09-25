import { describe, expect, it } from "vitest";
import type { FilterDef } from "@/lib/config";
import {
  activeFilters,
  applyHardFilters,
  compareScored,
  containsTerm,
  evaluateEnum,
  evaluateFilter,
  evaluateRange,
  isFilterActive,
  matchesAnyTerm,
  passesHard,
  rankProperties,
  scoreProperty,
  slugify,
  termsFor,
  valuesFor,
} from "@/lib/scoring";
import { boolFilter, makeConfig, makeProperty, rangeFilter } from "./helpers";

const config = makeConfig([
  rangeFilter(),
  rangeFilter({ id: "drive", label: "Drive", source: "routes", field: "driveTimeMin", unit: "min", max: 480, step: 15 }),
  rangeFilter({ id: "rating", label: "Rating", source: "places", field: "rating", hard: false, weight: 0.5, unit: "★", max: 5, step: 0.1, tolerance: 1 }),
  boolFilter(),
  { id: "quiet", label: "Quiet", type: "llm_tag", source: "enrichment", weight: 1, synonyms: ["peaceful"] },
  {
    id: "stay_type",
    label: "Stay type",
    type: "enum",
    source: "places",
    weight: 0.5,
    matchOn: ["types", "name"],
    options: [
      { value: "villa", label: "Villa" },
      { value: "resort", label: "Resort", synonyms: ["resort_hotel"] },
    ],
  },
  { id: "unknown_ok", label: "Rating (lenient)", type: "range", source: "places", field: "reviewCount", hard: true, allowUnknown: true, min: 0, max: 1000 },
]);
const byId = (id: string) => config.filters.find((f) => f.id === id) as FilterDef;

describe("terms", () => {
  it("slugifies", () => {
    expect(slugify("Free Wi-Fi!")).toBe("free_wi_fi");
    expect(slugify("  Café & Bar ")).toBe("cafe_bar");
  });

  it("matches on token boundaries with simple plurals", () => {
    expect(containsTerm("Outdoor pool", "pool")).toBe(true);
    expect(containsTerm("Pools", "pool")).toBe(true);
    expect(containsTerm("Whirlpool", "pool")).toBe(false);
    expect(containsTerm("Heated private pool", "private pool")).toBe(true);
    expect(containsTerm("anything", "  ")).toBe(false);
  });

  it("matchesAnyTerm and valuesFor", () => {
    const p = makeProperty({ name: "Blue Villa", amenities: ["Spa"], tags: ["quiet"], types: ["resort_hotel"] });
    expect(valuesFor(p, ["name", "types"])).toEqual(["Blue Villa", "resort_hotel"]);
    expect(valuesFor(p, ["amenities", "tags"])).toEqual(["Spa", "quiet"]);
    expect(matchesAnyTerm(["Spa"], ["massage", "spa"])).toBe(true);
    expect(matchesAnyTerm([], ["spa"])).toBe(false);
  });

  it("termsFor uses key or id plus synonyms", () => {
    expect(termsFor(byId("pool") as never)).toEqual(["pool", "swimming pool"]);
    const keyed = makeConfig([boolFilter({ key: "swim" })]).filters[0];
    expect(termsFor(keyed as never)).toEqual(["swim", "swimming pool"]);
  });
});

describe("isFilterActive", () => {
  it("range is active when either bound is set", () => {
    expect(isFilterActive(byId("price"), { min: null, max: null })).toBe(false);
    expect(isFilterActive(byId("price"), { min: 100, max: null })).toBe(true);
    expect(isFilterActive(byId("price"), { min: null, max: 100 })).toBe(true);
    expect(isFilterActive(byId("price"), undefined)).toBe(false);
    expect(isFilterActive(byId("price"), true)).toBe(false);
  });
  it("bool / llm_tag are active only when true", () => {
    expect(isFilterActive(byId("pool"), true)).toBe(true);
    expect(isFilterActive(byId("pool"), false)).toBe(false);
    expect(isFilterActive(byId("quiet"), true)).toBe(true);
  });
  it("enum is active only for a valid option", () => {
    expect(isFilterActive(byId("stay_type"), "villa")).toBe(true);
    expect(isFilterActive(byId("stay_type"), "castle")).toBe(false);
    expect(isFilterActive(byId("stay_type"), null)).toBe(false);
  });
});

describe("evaluateRange", () => {
  const price = byId("price") as Extract<FilterDef, { type: "range" }>;
  const rating = byId("rating") as Extract<FilterDef, { type: "range" }>;

  it("passes inside the range", () => {
    expect(evaluateRange(price, { min: 1000, max: 5000 }, makeProperty({ nightlyRate: 3000 }))).toEqual({ status: "pass", score: 1 });
    expect(evaluateRange(price, { min: null, max: 5000 }, makeProperty({ nightlyRate: 5000 }))).toEqual({ status: "pass", score: 1 });
  });
  it("is unknown when the value is missing", () => {
    expect(evaluateRange(price, { min: null, max: 5000 }, makeProperty())).toEqual({ status: "unknown", score: 0 });
    expect(evaluateRange(price, { min: null, max: 5000 }, makeProperty({ nightlyRate: NaN }))).toEqual({ status: "unknown", score: 0 });
  });
  it("decays linearly outside the range using the default tolerance (25% of bound)", () => {
    const r = evaluateRange(price, { min: null, max: 8000 }, makeProperty({ nightlyRate: 9000 }));
    expect(r.status).toBe("fail");
    expect(r.score).toBeCloseTo(0.5);
    expect(evaluateRange(price, { min: null, max: 8000 }, makeProperty({ nightlyRate: 20000 })).score).toBe(0);
  });
  it("decays below the min bound", () => {
    const r = evaluateRange(price, { min: 4000, max: 8000 }, makeProperty({ nightlyRate: 3500 }));
    expect(r).toEqual({ status: "fail", score: 0.5 });
  });
  it("uses step as tolerance floor when bound is 0", () => {
    const r = evaluateRange(price, { min: null, max: 0 }, makeProperty({ nightlyRate: 250 }));
    expect(r.score).toBeCloseTo(0.5);
  });
  it("uses the explicit tolerance when configured", () => {
    const r = evaluateRange(rating, { min: 4, max: null }, makeProperty({ rating: 3.5 }));
    expect(r.score).toBeCloseTo(0.5);
  });
});

describe("evaluateFilter", () => {
  it("bool matches amenities via synonyms", () => {
    expect(evaluateFilter(byId("pool"), true, makeProperty({ amenities: ["Swimming pool"] })).status).toBe("pass");
    expect(evaluateFilter(byId("pool"), true, makeProperty({ amenities: ["Gym"] }))).toEqual({ status: "fail", score: 0 });
  });
  it("llm_tag matches tags", () => {
    expect(evaluateFilter(byId("quiet"), true, makeProperty({ tags: ["quiet"] })).status).toBe("pass");
    expect(evaluateFilter(byId("quiet"), true, makeProperty({ amenities: ["quiet"] })).status).toBe("fail");
  });
  it("enum matches option value or synonyms on configured targets", () => {
    expect(evaluateFilter(byId("stay_type"), "villa", makeProperty({ name: "Sunny Villa" })).status).toBe("pass");
    expect(evaluateFilter(byId("stay_type"), "resort", makeProperty({ types: ["resort_hotel"] })).status).toBe("pass");
    expect(evaluateFilter(byId("stay_type"), "resort", makeProperty({ name: "Sunny Villa" })).status).toBe("fail");
    expect(evaluateEnum(byId("stay_type") as never, "castle", makeProperty())).toEqual({ status: "unknown", score: 0 });
  });
  it("returns unknown for malformed values", () => {
    expect(evaluateFilter(byId("price"), true, makeProperty({ nightlyRate: 1 })).status).toBe("unknown");
    expect(evaluateFilter(byId("stay_type"), null, makeProperty()).status).toBe("unknown");
  });
});

describe("passesHard", () => {
  it("unknown fails unless allowUnknown", () => {
    expect(passesHard(byId("price"), { status: "unknown", score: 0 })).toBe(false);
    expect(passesHard(byId("unknown_ok"), { status: "unknown", score: 0 })).toBe(true);
    expect(passesHard(byId("price"), { status: "pass", score: 1 })).toBe(true);
    expect(passesHard(byId("price"), { status: "fail", score: 0.9 })).toBe(false);
  });
});

describe("applyHardFilters", () => {
  const props = [
    makeProperty({ id: "a", nightlyRate: 3000, driveTimeMin: 60 }),
    makeProperty({ id: "b", nightlyRate: 9000, driveTimeMin: 200 }),
    makeProperty({ id: "c", driveTimeMin: 100 }),
  ];
  const values = { price: { min: null, max: 5000 }, drive: { min: null, max: 120 }, pool: true };

  it("excludes on all active hard filters and reports which failed", () => {
    const r = applyHardFilters(props, config.filters, values);
    expect(r.kept.map((p) => p.id)).toEqual(["a"]);
    expect(r.rejected).toEqual([
      { property: props[1], failed: ["price", "drive"] },
      { property: props[2], failed: ["price"] },
    ]);
  });
  it("restricts to given sources", () => {
    const r = applyHardFilters(props, config.filters, values, ["routes"]);
    expect(r.kept.map((p) => p.id)).toEqual(["a", "c"]);
  });
  it("ignores soft filters and inactive hard filters", () => {
    const r = applyHardFilters(props, config.filters, { pool: true, price: { min: null, max: null } });
    expect(r.kept).toHaveLength(3);
  });
  it("keeps unknowns for allowUnknown filters", () => {
    const r = applyHardFilters([makeProperty({ reviewCount: undefined })], config.filters, { unknown_ok: { min: 10, max: null } });
    expect(r.kept).toHaveLength(1);
  });
});

describe("scoreProperty", () => {
  it("is 100 with no active soft filters", () => {
    const s = scoreProperty(makeProperty(), config.filters, {});
    expect(s.matchScore).toBe(100);
    expect(s.breakdown).toEqual([]);
  });

  it("weights contributions and normalizes to 100", () => {
    // pool (0.5) passes, quiet (1.0) fails -> 0.5 / 1.5 = 33
    const p = makeProperty({ amenities: ["Swimming pool"], tags: [] });
    const s = scoreProperty(p, config.filters, { pool: true, quiet: true });
    expect(s.matchScore).toBe(33);
    expect(s.breakdown).toEqual([
      { filterId: "pool", label: "Pool", hard: false, status: "pass", passed: true, contribution: 33.3, maxContribution: 33.3 },
      { filterId: "quiet", label: "Quiet", hard: false, status: "fail", passed: false, contribution: 0, maxContribution: 66.7 },
    ]);
  });

  it("includes hard filters in the breakdown with zero contribution", () => {
    const s = scoreProperty(makeProperty({ nightlyRate: 4000 }), config.filters, { price: { min: null, max: 5000 }, pool: true });
    const hard = s.breakdown.find((b) => b.filterId === "price")!;
    expect(hard).toMatchObject({ hard: true, passed: true, contribution: 0, maxContribution: 0 });
    expect(s.matchScore).toBe(0);
  });

  it("gives partial credit for near-miss ranges", () => {
    const s = scoreProperty(makeProperty({ rating: 3.5 }), config.filters, { rating: { min: 4, max: null } });
    expect(s.matchScore).toBe(50);
  });

  it("scores 100 when only zero-weight soft filters are active", () => {
    const zero = makeConfig([boolFilter({ weight: 0 })]);
    const s = scoreProperty(makeProperty(), zero.filters, { pool: true });
    expect(s.matchScore).toBe(100);
    expect(s.breakdown[0]!.maxContribution).toBe(0);
  });
});

describe("ranking", () => {
  it("sorts by score, then rating, then drive time, then name", () => {
    const values = { pool: true };
    const props = [
      makeProperty({ id: "none", name: "Z", amenities: [] }),
      makeProperty({ id: "far", name: "B", amenities: ["Pool"], rating: 4.5, driveTimeMin: 200 }),
      makeProperty({ id: "near", name: "C", amenities: ["Pool"], rating: 4.5, driveTimeMin: 60 }),
      makeProperty({ id: "top", name: "D", amenities: ["Pool"], rating: 4.9 }),
      makeProperty({ id: "alpha", name: "A", amenities: ["Pool"], rating: 4.5, driveTimeMin: 60 }),
    ];
    expect(rankProperties(props, config.filters, values).map((s) => s.property.id)).toEqual(["top", "alpha", "near", "far", "none"]);
  });

  it("compareScored handles missing rating and drive time", () => {
    const a = scoreProperty(makeProperty({ name: "A", rating: undefined }), [], {});
    const b = scoreProperty(makeProperty({ name: "B", rating: undefined }), [], {});
    expect(compareScored(a, b)).toBeLessThan(0);
  });

  it("activeFilters returns only constrained filters", () => {
    expect(activeFilters(config.filters, { pool: true, quiet: false }).map((f) => f.id)).toEqual(["pool"]);
  });
});
