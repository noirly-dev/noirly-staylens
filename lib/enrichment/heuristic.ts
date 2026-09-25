import { containsTerm } from "@/lib/scoring/terms";
import type { Enricher, EnrichmentInput } from "./types";
import type { TagDef } from "./vocabulary";

const NEGATIONS = /\b(no|not|never|without|isn't|wasn't|lacks?|patchy|poor)\b/i;

/**
 * Keyword enricher (no AI model): tags a place when its description, reviews or amenities mention a tag or
 * one of its synonyms. Sentences with a negation ("Wi-Fi was patchy, not great for working")
 * are ignored to avoid obvious false positives.
 */
export class HeuristicEnricher implements Enricher {
  readonly name = "heuristic";

  async enrich(items: readonly EnrichmentInput[], vocabulary: readonly TagDef[]) {
    const out = new Map<string, string[]>();
    for (const { property, details } of items) {
      const sentences = [details?.description ?? "", ...(details?.reviews ?? []), ...property.amenities]
        .flatMap((t) => t.split(/(?<=[.!?])\s+/))
        .filter((s) => s && !NEGATIONS.test(s));
      const tags = vocabulary
        .filter((v) => sentences.some((s) => [v.tag, v.label, ...v.synonyms].some((term) => containsTerm(s, term))))
        .map((v) => v.tag);
      out.set(property.placeId, tags);
    }
    return out;
  }
}
