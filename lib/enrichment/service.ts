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
  fallback?: string;
}

export class EnrichmentService {
  readonly vocabulary: TagDef[];
  readonly vocabHash: string;

  constructor(
    config: FilterConfig,
    private readonly store: EnrichmentStore,
    private readonly primary: Enricher,
    private readonly fallback?: Enricher,
  ) {
    this.vocabulary = buildTagVocabulary(config);
    this.vocabHash = vocabularyHash(this.vocabulary);
  }

  get enricherName() {
    return this.primary.name;
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
    const stats: EnrichmentStats = { cached: 0, computed: 0, enricher: this.primary.name };
    if (!this.vocabulary.length) return { properties: [...properties], stats };

    const stored = await this.store.getMany(properties.map((p) => p.placeId));
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
      let computed: Map<string, string[]>;
      let model = this.primary.name;
      try {
        computed = await this.primary.enrich(inputs, this.vocabulary);
      } catch (err) {
        if (!this.fallback) throw err;
        console.warn(`[enrichment] ${this.primary.name} failed, using ${this.fallback.name}`, err);
        computed = await this.fallback.enrich(inputs, this.vocabulary);
        model = this.fallback.name;
        stats.fallback = this.fallback.name;
      }
      const toStore = new Map<string, StoredEnrichment>();
      const allowed = new Set(this.vocabulary.map((v) => v.tag));
      for (const [id, tags] of computed) {
        const clean = tags.filter((t) => allowed.has(t));
        tagsById.set(id, clean);
        toStore.set(id, { tags: clean, vocabHash: this.vocabHash, model });
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
