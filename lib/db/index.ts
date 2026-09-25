import { inArray, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { EnrichmentStore, StoredEnrichment } from "@/lib/enrichment/types";
import type { EntityMatchSink } from "@/lib/providers/serpapi";

export type Db = PostgresJsDatabase<typeof schema>;

let db: Db | undefined;

export function getDb(url: string): Db {
  db ??= drizzle(postgres(url, { max: 5, prepare: false }), { schema });
  return db;
}

export class PgEnrichmentStore implements EnrichmentStore {
  constructor(private readonly db: Db) {}

  async getMany(placeIds: readonly string[]) {
    const out = new Map<string, StoredEnrichment>();
    if (!placeIds.length) return out;
    const rows = await this.db.select().from(schema.enrichments).where(inArray(schema.enrichments.placeId, [...placeIds]));
    for (const r of rows) out.set(r.placeId, { tags: r.tags, vocabHash: r.vocabHash, model: r.model });
    return out;
  }

  async putMany(entries: ReadonlyMap<string, StoredEnrichment>) {
    if (!entries.size) return;
    const values = [...entries].map(([placeId, e]) => ({ placeId, ...e, updatedAt: new Date() }));
    await this.db
      .insert(schema.enrichments)
      .values(values)
      .onConflictDoUpdate({
        target: schema.enrichments.placeId,
        set: {
          tags: sql`excluded.tags`,
          vocabHash: sql`excluded.vocab_hash`,
          model: sql`excluded.model`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}

export class PgEntityMatchSink implements EntityMatchSink {
  constructor(private readonly db: Db) {}

  async record(e: Parameters<EntityMatchSink["record"]>[0]) {
    const row = {
      placeId: e.placeId,
      provider: e.provider,
      providerPropertyId: e.providerPropertyId,
      providerName: e.providerName,
      location: { x: e.lng, y: e.lat },
      confidence: e.confidence,
      updatedAt: new Date(),
    };
    await this.db
      .insert(schema.entityMatches)
      .values(row)
      .onConflictDoUpdate({ target: [schema.entityMatches.placeId, schema.entityMatches.provider], set: row });
  }
}
