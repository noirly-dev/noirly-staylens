import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { getFilterConfig } from "@/lib/config";
import { HeuristicEnricher } from "@/lib/enrichment/heuristic";
import { LlmEnricher, buildEnrichmentPrompt } from "@/lib/enrichment/llm";
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

describe("LlmEnricher", () => {
  const fakeClient = (parsed: unknown, stop_reason = "end_turn") =>
    ({ messages: { parse: vi.fn().mockResolvedValue({ parsed_output: parsed, stop_reason }) } }) as unknown as Anthropic;

  it("builds a prompt with vocabulary and stays", () => {
    const prompt = buildEnrichmentPrompt([{ property: makeProperty({ placeId: "x1", amenities: ["Spa"] }), details: { placeId: "x1", description: "d".repeat(700), reviews: ["nice"] } }], vocab);
    expect(prompt).toContain('<stay placeId="x1">');
    expect(prompt).toContain("- quiet:");
    expect(prompt).toContain("amenities: Spa");
    expect(prompt).toContain("…");
  });

  it("returns tags per place and fills skipped places with []", async () => {
    const client = fakeClient({ results: [{ placeId: "a", tags: ["quiet", "quiet"] }, { placeId: "zzz", tags: ["view"] }] });
    const e = new LlmEnricher(client, "claude-sonnet-4-6");
    const out = await e.enrich(
      [
        { property: makeProperty({ placeId: "a" }), details: null },
        { property: makeProperty({ placeId: "b" }), details: null },
      ],
      vocab,
    );
    expect(out.get("a")).toEqual(["quiet"]);
    expect(out.get("b")).toEqual([]);
    expect(out.has("zzz")).toBe(false);
    expect(e.name).toBe("llm:claude-sonnet-4-6");
    const args = (client.messages.parse as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.output_config.format).toBeDefined();
  });

  it("throws on refusal and short-circuits on empty input", async () => {
    await expect(new LlmEnricher(fakeClient(null, "refusal"), "m").enrich([{ property: makeProperty(), details: null }], vocab)).rejects.toThrow(/refusal/);
    expect((await new LlmEnricher(fakeClient(null), "m").enrich([], vocab)).size).toBe(0);
  });
});

describe("EnrichmentService", () => {
  it("caches by vocab hash and falls back when the primary enricher fails", async () => {
    const places = new MockPlacesProvider();
    const store = new MemoryEnrichmentStore();
    const failing: Enricher = { name: "llm:x", enrich: vi.fn().mockRejectedValue(new Error("boom")) };
    const svc = new EnrichmentService(config, store, failing, { name: "heuristic", enrich: async () => new Map([["p1", ["quiet", "not_a_tag"]]]) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = await svc.enrich([makeProperty({ placeId: "p1", tags: ["existing"] })], places, { compute: true });
    expect(first.properties[0]!.tags).toEqual(["existing", "quiet"]);
    expect(first.stats).toMatchObject({ computed: 1, fallback: "heuristic" });
    const second = await svc.enrich([makeProperty({ placeId: "p1" })], places, { compute: true });
    expect(second.stats).toMatchObject({ cached: 1, computed: 0 });
    expect(failing.enrich).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("does not compute when compute=false, and rethrows without a fallback", async () => {
    const places = new MockPlacesProvider();
    const failing: Enricher = { name: "x", enrich: vi.fn().mockRejectedValue(new Error("boom")) };
    const svc = new EnrichmentService(config, new MemoryEnrichmentStore(), failing);
    const r = await svc.enrich([makeProperty()], places, { compute: false });
    expect(r.stats.computed).toBe(0);
    await expect(svc.enrich([makeProperty()], places, { compute: true })).rejects.toThrow("boom");
  });

  it("is a no-op with an empty vocabulary", async () => {
    const c = makeConfig([{ id: "pool", label: "Pool", type: "bool", source: "places", weight: 1 }]);
    const svc = new EnrichmentService(c, new MemoryEnrichmentStore(), new HeuristicEnricher());
    const r = await svc.enrich([makeProperty()], new MockPlacesProvider(), { compute: true });
    expect(r.stats.computed).toBe(0);
  });
});
