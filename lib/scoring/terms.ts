import type { MatchTarget } from "@/lib/config/schema";
import type { Property } from "@/lib/types";

/** "Free Wi-Fi!" -> "free_wi_fi" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * True when `term` appears in `text` on slug-token boundaries, allowing a trailing "s"
 * ("pool" matches "outdoor_pool" and "pools", but not "whirlpool").
 */
export function containsTerm(text: string, term: string): boolean {
  const t = slugify(term);
  if (!t) return false;
  const haystack = `_${slugify(text)}_`;
  return haystack.includes(`_${t}_`) || haystack.includes(`_${t}s_`);
}

export function matchesAnyTerm(values: readonly string[], terms: readonly string[]): boolean {
  return values.some((v) => terms.some((t) => containsTerm(v, t)));
}

export function valuesFor(property: Property, targets: readonly MatchTarget[]): string[] {
  return targets.flatMap((t) => (t === "name" ? [property.name] : property[t]));
}
