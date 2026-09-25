import type { FilterConfig } from "@/lib/config/schema";
import type { PlacesProvider } from "@/lib/providers/types";
import type { Property } from "@/lib/types";
import { mapLimit } from "@/lib/util/concurrency";
import type { Enricher, EnrichmentInput, EnrichmentStore, StoredEnrichment } from "./types";
import { buildTagVocabulary, vocabularyHash, type TagDef } from "./vocabulary";

export interface EnrichmentStats {
  cached: number;
  computed: number;
  enricher: string;
}

export class EnrichmentService {
  readonly vocabulary: TagDef[];
  readonly vocabHash: string;

  constructor(
    config: FilterConfig,
    private readonly store: EnrichmentStore,
    private readonly enricher: Enricher,
  ) {
    this.vocabulary = buildTagVocabulary(config);
    this.vocabHash = vocabularyHash(this.vocabulary);
  }

  get enricherName() {
    return this.enricher.name;
  }

  /**
   * Attach enrichment tags to properties. Cached tags (matching the current vocabulary) are
   * always loaded; missing ones are computed only when `compute` is true.
   */
  async enrich(
    properties: readonly Property[],
    places: PlacesProvider,
    { compute }: { compute: boolean },
  ): Promise<{ properties: Property[]; stats: EnrichmentStats }> {
    const stats: EnrichmentStats = { cached: 0, computed: 0, enricher: this.enricher.name };
    if (!this.vocabulary.length) return { properties: [...properties], stats };

    // A store outage degrades to "nothing cached" rather than failing the search.
    const stored = await this.store.getMany(properties.map((p) => p.placeId)).catch((err) => {
      console.warn("[enrichment] failed to read cached tags", err);
      return new Map<string, StoredEnrichment>();
    });
    const tagsById = new Map<string, string[]>();
    const missing: Property[] = [];
    for (const p of properties) {
      const hit = stored.get(p.placeId);
      if (hit && hit.vocabHash === this.vocabHash) {
        tagsById.set(p.placeId, hit.tags);
        stats.cached++;
      } else {
        missing.push(p);
      }
    }

    if (compute && missing.length) {
      const inputs: EnrichmentInput[] = await mapLimit(missing, 5, async (property) => ({
        property,
        details: await places.getDetails(property.placeId).catch(() => null),
      }));
      const computed = await this.enricher.enrich(inputs, this.vocabulary);
      const toStore = new Map<string, StoredEnrichment>();
      const allowed = new Set(this.vocabulary.map((v) => v.tag));
      for (const [id, tags] of computed) {
        const clean = tags.filter((t) => allowed.has(t));
        tagsById.set(id, clean);
        toStore.set(id, { tags: clean, vocabHash: this.vocabHash, enricher: this.enricher.name });
      }
      stats.computed = toStore.size;
      await this.store.putMany(toStore).catch((err) => console.warn("[enrichment] failed to persist tags", err));
    }

    return {
      properties: properties.map((p) => {
        const tags = tagsById.get(p.placeId);
        return tags ? { ...p, tags: [...new Set([...p.tags, ...tags])] } : p;
      }),
      stats,
    };
  }
}
