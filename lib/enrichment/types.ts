import type { PlaceDetails, Property } from "@/lib/types";
import type { TagDef } from "./vocabulary";

export interface EnrichmentInput {
  property: Property;
  details: PlaceDetails | null;
}

export interface Enricher {
  readonly name: string;
  /** Returns tags (subset of vocabulary) per placeId. */
  enrich(items: readonly EnrichmentInput[], vocabulary: readonly TagDef[]): Promise<Map<string, string[]>>;
}

export interface StoredEnrichment {
  tags: string[];
  vocabHash: string;
  /** Which enricher produced the tags. */
  enricher: string;
}

/** Persistent store for derived tags, keyed by placeId. */
export interface EnrichmentStore {
  getMany(placeIds: readonly string[]): Promise<Map<string, StoredEnrichment>>;
  putMany(entries: ReadonlyMap<string, StoredEnrichment>): Promise<void>;
}

export class MemoryEnrichmentStore implements EnrichmentStore {
  private readonly data = new Map<string, StoredEnrichment>();

  async getMany(placeIds: readonly string[]) {
    const out = new Map<string, StoredEnrichment>();
    for (const id of placeIds) {
      const v = this.data.get(id);
      if (v) out.set(id, v);
    }
    return out;
  }

  async putMany(entries: ReadonlyMap<string, StoredEnrichment>) {
    for (const [k, v] of entries) this.data.set(k, v);
  }
}
