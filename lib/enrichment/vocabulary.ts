import type { FilterConfig } from "@/lib/config/schema";
import { hashString } from "@/lib/util/hash";

export interface TagDef {
  tag: string;
  label: string;
  description?: string;
  synonyms: string[];
}

/** Tags the enrichment pipeline may emit — every enrichment-sourced filter in config. */
export function buildTagVocabulary(config: FilterConfig): TagDef[] {
  return config.filters.flatMap((f): TagDef[] => {
    if (f.source !== "enrichment") return [];
    if (f.type === "bool" || f.type === "llm_tag") {
      return [{ tag: f.key ?? f.id, label: f.label, description: f.description, synonyms: f.synonyms }];
    }
    if (f.type === "enum") {
      return f.options.map((o) => ({ tag: o.value, label: `${f.label}: ${o.label}`, synonyms: o.synonyms }));
    }
    return [];
  });
}

/** Changes whenever the vocabulary changes, so cached tags get recomputed for new filters. */
export function vocabularyHash(vocab: readonly TagDef[]): string {
  return hashString(JSON.stringify(vocab.map((t) => [t.tag, t.description ?? "", t.synonyms]).sort())).toString(36);
}
