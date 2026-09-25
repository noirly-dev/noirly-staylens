import { describe, expect, it, vi } from "vitest";
import { getFilterConfig } from "@/lib/config";
import { HeuristicEnricher } from "@/lib/enrichment/heuristic";
import { EnrichmentService } from "@/lib/enrichment/service";
import { MemoryEnrichmentStore, type Enricher } from "@/lib/enrichment/types";
import { buildTagVocabulary, vocabularyHash } from "@/lib/enrichment/vocabulary";
import { MockPlacesProvider } from "@/lib/providers/mock/places";
import { makeConfig, makeProperty } from "./helpers";

const config = getFilterConfig();
const vocab = buildTagVocabulary(config);

describe("vocabulary", () => {
  it("comes from enrichment-sourced filters in config", () => {
    const tags = vocab.map((v) => v.tag);
    expect(tags).toEqual(expect.arrayContaining(["quiet", "private_pool", "workation_ready"]));
    expect(tags).not.toContain("pool");
  });

  it("includes enrichment enum options and changes hash with vocabulary", () => {
    const c = makeConfig([
      { id: "vibe", label: "Vibe", type: "enum", source: "enrichment", weight: 1, options: [{ value: "party", label: "Party" }] },
      { id: "q", label: "Q", type: "bool", source: "enrichment", weight: 1 },
      { id: "r", label: "R", type: "range", source: "places", field: "rating", weight: 1, min: 0, max: 5 },
    ]);
    const v = buildTagVocabulary(c);
    expect(v.map((t) => t.tag)).toEqual(["party", "q"]);
    expect(vocabularyHash(v)).not.toBe(vocabularyHash(vocab));
  });
});

describe("HeuristicEnricher", () => {
  it("tags from description/reviews and ignores negated sentences", async () => {
    const p = makeProperty({ placeId: "h1" });
    const out = await new HeuristicEnricher().enrich(
      [{ property: p, details: { placeId: "h1", description: "A secluded hideaway. Every villa has its own plunge pool.", reviews: ["Wi-Fi was patchy, not great for remote work."] } }],
      vocab,
    );
    expect(out.get("h1")).toEqual(expect.arrayContaining(["quiet", "private_pool"]));
    expect(out.get("h1")).not.toContain("workation_ready");
  });
});

describe("EnrichmentService", () => {
  it("caches by vocab hash and only keeps vocabulary tags", async () => {
    const places = new MockPlacesProvider();
    const store = new MemoryEnrichmentStore();
    const enricher: Enricher = { name: "keywords", enrich: vi.fn(async () => new Map([["p1", ["quiet", "not_a_tag"]]])) };
    const svc = new EnrichmentService(config, store, enricher);
    const first = await svc.enrich([makeProperty({ placeId: "p1", tags: ["existing"] })], places, { compute: true });
    expect(first.properties[0]!.tags).toEqual(["existing", "quiet"]);
    expect(first.stats).toMatchObject({ computed: 1, enricher: "keywords" });
    expect((await store.getMany(["p1"])).get("p1")).toEqual({ tags: ["quiet"], vocabHash: svc.vocabHash, enricher: "keywords" });
    const second = await svc.enrich([makeProperty({ placeId: "p1" })], places, { compute: true });
    expect(second.stats).toMatchObject({ cached: 1, computed: 0 });
    expect(enricher.enrich).toHaveBeenCalledTimes(1);
  });

  it("recomputes when the stored vocabulary hash is stale", async () => {
    const store = new MemoryEnrichmentStore();
    await store.putMany(new Map([["p1", { tags: ["quiet"], vocabHash: "old", enricher: "keywords" }]]));
    const svc = new EnrichmentService(config, store, new HeuristicEnricher());
    const r = await svc.enrich([makeProperty({ placeId: "p1" })], new MockPlacesProvider(), { compute: true });
    expect(r.stats).toMatchObject({ cached: 0, computed: 1 });
  });

  it("treats a store read failure as a cache miss", async () => {
    const store = new MemoryEnrichmentStore();
    vi.spyOn(store, "getMany").mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const svc = new EnrichmentService(config, store, new HeuristicEnricher());
    const r = await svc.enrich([makeProperty({ placeId: "p1" })], new MockPlacesProvider(), { compute: true });
    expect(r.stats).toMatchObject({ cached: 0, computed: 1 });
    warn.mockRestore();
  });

  it("does not compute when compute=false", async () => {
    const enricher: Enricher = { name: "x", enrich: vi.fn() };
    const svc = new EnrichmentService(config, new MemoryEnrichmentStore(), enricher);
    const r = await svc.enrich([makeProperty()], new MockPlacesProvider(), { compute: false });
    expect(r.stats.computed).toBe(0);
    expect(enricher.enrich).not.toHaveBeenCalled();
  });

  it("is a no-op with an empty vocabulary", async () => {
    const c = makeConfig([{ id: "pool", label: "Pool", type: "bool", source: "places", weight: 1 }]);
    const svc = new EnrichmentService(c, new MemoryEnrichmentStore(), new HeuristicEnricher());
    const r = await svc.enrich([makeProperty()], new MockPlacesProvider(), { compute: true });
    expect(r.stats.computed).toBe(0);
  });
});
