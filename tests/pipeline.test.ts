import { describe, expect, it } from "vitest";
import raw from "@/config/filters.json";
import { getFilterConfig, parseFilterConfig, type FilterConfig } from "@/lib/config";
import { HeuristicEnricher } from "@/lib/enrichment/heuristic";
import { EnrichmentService } from "@/lib/enrichment/service";
import { MemoryEnrichmentStore } from "@/lib/enrichment/types";
import { MockPlacesProvider } from "@/lib/providers/mock/places";
import { MockRatesProvider } from "@/lib/providers/mock/rates";
import { MockRoutesProvider } from "@/lib/providers/mock/routes";
import { runSearch, searchRadiusKm, type SearchDeps } from "@/lib/search/pipeline";
import { buildSearchRequestSchema } from "@/lib/search/request";

const BLR = { lat: 12.9716, lng: 77.5946, label: "Bengaluru" };

function deps(config: FilterConfig = getFilterConfig()) {
  const places = new MockPlacesProvider();
  const rates = new MockRatesProvider(config.currency, (id) => places.basePriceFor(id));
  const d: SearchDeps = {
    config,
    places,
    routes: new MockRoutesProvider(),
    rates,
    enrichment: new EnrichmentService(config, new MemoryEnrichmentStore(), new HeuristicEnricher()),
  };
  return { d, rates };
}

function request(config: FilterConfig, filters: Record<string, unknown> = {}) {
  return buildSearchRequestSchema(config).parse({ origin: BLR, checkIn: "2026-10-09", checkOut: "2026-10-11", guests: 2, filters });
}

describe("search pipeline (offline mocks)", () => {
  it("runs end to end and returns ranked, priced results", async () => {
    const config = getFilterConfig();
    const { d } = deps(config);
    const res = await runSearch(request(config, { price_per_night: { min: null, max: 15000 }, quiet: true }), d);
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.property.nightlyRate).toBeLessThanOrEqual(15000);
      expect(r.property.driveTimeMin).toBeLessThanOrEqual(240);
      expect(r.matchScore).toBeGreaterThanOrEqual(0);
      expect(r.matchScore).toBeLessThanOrEqual(100);
    }
    const scores = res.results.map((r) => r.matchScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(res.meta.stages.map((s) => s.stage)).toEqual(["candidates", "drive_time", "attributes", "enrichment", "shortlist", "price"]);
    expect(res.meta.providers).toEqual({ places: "mock", routes: "mock", rates: "mock", enrichment: "heuristic" });
    expect(res.meta.googleAttribution).toBe(false);
  });

  it("fetches rates for at most 25 properties", async () => {
    const config = getFilterConfig();
    const { d, rates } = deps(config);
    const res = await runSearch(request(config, { drive_time: { min: null, max: 480 }, rating: { min: null, max: null } }), d);
    expect(res.meta.stages[0]!.count).toBeGreaterThan(25);
    expect(rates.calls).toBeLessThanOrEqual(25);
    expect(res.meta.ratesFetched).toBe(rates.calls);
  });

  it("applies hard drive-time filters before fetching rates", async () => {
    const config = getFilterConfig();
    const { d } = deps(config);
    const res = await runSearch(request(config, { drive_time: { min: null, max: 60 } }), d);
    expect(res.meta.radiusKm).toBe(70);
    for (const r of res.results) expect(r.property.driveTimeMin).toBeLessThanOrEqual(60);
    expect(res.meta.exclusions.drive_time ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("excludes properties with no price when a price filter is active", async () => {
    const config = getFilterConfig();
    const { d } = deps(config);
    const res = await runSearch(request(config, { price_per_night: { min: null, max: 50000 }, drive_time: { min: null, max: 480 } }), d);
    for (const r of res.results) expect(r.property.nightlyRate).toBeDefined();
  });

  it("a new bool filter added to config affects scoring with no code changes", async () => {
    const base = structuredClone(raw) as { filters: Record<string, unknown>[] };
    base.filters.push({
      id: "gym",
      label: "Gym",
      group: "Amenities",
      type: "bool",
      source: "places",
      weight: 1,
      synonyms: ["fitness center"],
      default: false,
    });
    const config = parseFilterConfig(base);
    const { d } = deps(config);
    const withGym = await runSearch(request(config, { gym: true }), d);
    const top = withGym.results[0]!;
    expect(top.breakdown.find((b) => b.filterId === "gym")).toMatchObject({ passed: true });
    expect(top.property.amenities).toContain("Fitness center");
    const noGym = withGym.results.find((r) => !r.property.amenities.includes("Fitness center"));
    if (noGym) expect(noGym.matchScore).toBeLessThan(top.matchScore);

    // As a hard filter it excludes non-matching properties.
    const hardBase = structuredClone(base);
    const gym = hardBase.filters.at(-1)!;
    delete gym.weight;
    gym.hard = true;
    const hardConfig = parseFilterConfig(hardBase);
    const hard = await runSearch(request(hardConfig, { gym: true }), deps(hardConfig).d);
    expect(hard.results.length).toBeGreaterThan(0);
    for (const r of hard.results) expect(r.property.amenities).toContain("Fitness center");
    expect(hard.meta.exclusions.gym).toBeGreaterThan(0);
  });

  it("only computes enrichment when an enrichment filter is active", async () => {
    const config = getFilterConfig();
    const { d } = deps(config);
    const plain = await runSearch(request(config), d);
    expect(plain.meta.enrichment.computed).toBe(0);
    const vibe = await runSearch(request(config, { view: true }), d);
    expect(vibe.meta.enrichment.computed).toBeGreaterThan(0);
    const again = await runSearch(request(config, { view: true }), d);
    expect(again.meta.enrichment.computed).toBe(0);
    expect(again.meta.enrichment.cached).toBeGreaterThan(0);
  });

  it("returns empty results gracefully", async () => {
    const config = getFilterConfig();
    const { d } = deps(config);
    const res = await runSearch(request(config, { price_per_night: { min: 49000, max: 50000 } }), d);
    expect(res.results).toEqual([]);
  });

  it("derives the search radius from max drive time", () => {
    const config = getFilterConfig();
    expect(searchRadiusKm(config, { drive_time: { min: null, max: 180 } })).toBe(210);
    expect(searchRadiusKm(config, { drive_time: { min: null, max: 480 } })).toBe(300);
    expect(searchRadiusKm(config, { drive_time: { min: null, max: null } })).toBe(100);
  });

  it("validates requests", () => {
    const schema = buildSearchRequestSchema(getFilterConfig());
    expect(schema.safeParse({ origin: BLR, checkIn: "2026-10-11", checkOut: "2026-10-09" }).success).toBe(false);
    expect(schema.safeParse({ origin: BLR, checkIn: "2026-10-09", checkOut: "2026-10-11", filters: { nope: 1 } }).success).toBe(false);
  });
});
