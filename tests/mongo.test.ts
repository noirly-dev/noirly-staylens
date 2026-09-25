import { describe, expect, it, vi } from "vitest";
import type { Collection } from "mongodb";
import { ensureIndexes, MongoEnrichmentStore, MongoEntityMatchSink, type EnrichmentDoc, type EntityMatchDoc } from "@/lib/db/mongo";

/** Minimal in-memory stand-in for the Collection methods the stores use. */
function fakeCollection<T extends { _id: string }>() {
  const docs = new Map<string, T>();
  const col = {
    docs,
    find: vi.fn((q: { _id: { $in: string[] } }) => ({
      toArray: async () => q._id.$in.flatMap((id) => (docs.has(id) ? [docs.get(id)!] : [])),
    })),
    bulkWrite: vi.fn(async (ops: { replaceOne: { filter: { _id: string }; replacement: Omit<T, "_id">; upsert: boolean } }[]) => {
      for (const { replaceOne: r } of ops) docs.set(r.filter._id, { _id: r.filter._id, ...r.replacement } as T);
    }),
    replaceOne: vi.fn(async (filter: { _id: string }, replacement: Omit<T, "_id">) => {
      docs.set(filter._id, { _id: filter._id, ...replacement } as T);
    }),
    createIndexes: vi.fn(async () => []),
  };
  return col as typeof col & Collection<T>;
}

describe("MongoEnrichmentStore", () => {
  it("round-trips tags keyed by placeId with upserts", async () => {
    const col = fakeCollection<EnrichmentDoc>();
    const store = new MongoEnrichmentStore(async () => col);
    expect((await store.getMany([])).size).toBe(0);
    await store.putMany(new Map());
    expect(col.bulkWrite).not.toHaveBeenCalled();

    await store.putMany(new Map([["p1", { tags: ["quiet"], vocabHash: "h", enricher: "heuristic" }]]));
    await store.putMany(new Map([["p1", { tags: ["view"], vocabHash: "h2", enricher: "heuristic" }]]));
    const got = await store.getMany(["p1", "missing"]);
    expect([...got]).toEqual([["p1", { tags: ["view"], vocabHash: "h2", enricher: "heuristic" }]]);
    expect(col.bulkWrite.mock.calls[0]![0][0]!.replaceOne.upsert).toBe(true);
  });
});

describe("MongoEntityMatchSink", () => {
  it("stores a GeoJSON point [lng, lat] per place + provider", async () => {
    const col = fakeCollection<EntityMatchDoc>();
    await new MongoEntityMatchSink(async () => col).record({
      placeId: "ChIJ1",
      provider: "serpapi",
      providerPropertyId: "tok",
      providerName: "Misty Hills",
      lat: 12.4,
      lng: 75.7,
      confidence: 0.9,
    });
    const doc = col.docs.get("ChIJ1:serpapi")!;
    expect(doc).toMatchObject({ placeId: "ChIJ1", provider: "serpapi", confidence: 0.9, location: { type: "Point", coordinates: [75.7, 12.4] } });
    expect(doc).not.toHaveProperty("lat");
  });

  it("creates a 2dsphere index on location", async () => {
    const col = fakeCollection<EntityMatchDoc>();
    await ensureIndexes({ collection: () => col } as never);
    expect(col.createIndexes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ key: { location: "2dsphere" } })]));
  });
});
