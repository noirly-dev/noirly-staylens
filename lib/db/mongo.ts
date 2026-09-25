import { MongoClient, type Collection, type Db } from "mongodb";
import type { EnrichmentStore, StoredEnrichment } from "@/lib/enrichment/types";
import type { EntityMatchSink } from "@/lib/providers/serpapi";

/**
 * Only Google place IDs are stored long-term (Google Maps Platform terms). Everything else is
 * derived data (tags) or rates-provider data (entity matches).
 */
export interface EnrichmentDoc {
  _id: string; // placeId
  tags: string[];
  /** Hash of the tag vocabulary the tags were computed against; a change triggers recompute. */
  vocabHash: string;
  enricher: string;
  updatedAt: Date;
}

/** Rates-provider listing ↔ place match, with the rates provider's own coordinates. */
export interface EntityMatchDoc {
  _id: string; // `${placeId}:${provider}`
  placeId: string;
  provider: string;
  providerPropertyId: string;
  providerName: string;
  /** GeoJSON point: [lng, lat]. Indexed 2dsphere for $near / $geoWithin queries. */
  location: { type: "Point"; coordinates: [number, number] };
  confidence: number;
  updatedAt: Date;
}

export const COLLECTIONS = { enrichments: "enrichments", entityMatches: "entity_matches" } as const;

let dbPromise: Promise<Db> | undefined;

/** Shared connection; indexes are ensured once per process. */
export function getMongoDb(uri: string, dbName: string): Promise<Db> {
  dbPromise ??= (async () => {
    const client = await new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 3000 }).connect();
    const db = client.db(dbName);
    await ensureIndexes(db);
    return db;
  })().catch((err) => {
    dbPromise = undefined; // retry on the next request instead of caching the failure
    throw err;
  });
  return dbPromise;
}

export async function ensureIndexes(db: Pick<Db, "collection">): Promise<void> {
  await db.collection<EntityMatchDoc>(COLLECTIONS.entityMatches).createIndexes([
    { key: { location: "2dsphere" }, name: "location_2dsphere" },
    { key: { placeId: 1 }, name: "placeId" },
  ]);
}

type Lazy<T> = () => Promise<T>;

export class MongoEnrichmentStore implements EnrichmentStore {
  constructor(private readonly collection: Lazy<Collection<EnrichmentDoc>>) {}

  async getMany(placeIds: readonly string[]) {
    const out = new Map<string, StoredEnrichment>();
    if (!placeIds.length) return out;
    const docs = await (await this.collection()).find({ _id: { $in: [...placeIds] } }).toArray();
    for (const d of docs) out.set(d._id, { tags: d.tags, vocabHash: d.vocabHash, enricher: d.enricher });
    return out;
  }

  async putMany(entries: ReadonlyMap<string, StoredEnrichment>) {
    if (!entries.size) return;
    const updatedAt = new Date();
    await (await this.collection()).bulkWrite(
      [...entries].map(([placeId, e]) => ({
        replaceOne: { filter: { _id: placeId }, replacement: { ...e, updatedAt }, upsert: true },
      })),
      { ordered: false },
    );
  }
}

export class MongoEntityMatchSink implements EntityMatchSink {
  constructor(private readonly collection: Lazy<Collection<EntityMatchDoc>>) {}

  async record(e: Parameters<EntityMatchSink["record"]>[0]) {
    const { lat, lng, ...rest } = e;
    await (await this.collection()).replaceOne(
      { _id: `${e.placeId}:${e.provider}` },
      { ...rest, location: { type: "Point", coordinates: [lng, lat] }, updatedAt: new Date() },
      { upsert: true },
    );
  }
}

export function createMongoStores(uri: string, dbName: string) {
  const db = () => getMongoDb(uri, dbName);
  return {
    enrichment: new MongoEnrichmentStore(async () => (await db()).collection<EnrichmentDoc>(COLLECTIONS.enrichments)),
    entityMatches: new MongoEntityMatchSink(async () => (await db()).collection<EntityMatchDoc>(COLLECTIONS.entityMatches)),
  };
}
