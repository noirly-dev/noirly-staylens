import { haversineKm } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

/** Words that carry little identity in lodging names. */
const GENERIC = new Set([
  "the", "a", "an", "and", "by", "at", "of", "in", "&", "resort", "resorts", "hotel", "hotels", "spa", "stay", "stays",
  "villa", "villas", "homestay", "retreat", "suites", "inn", "lodge", "cottages", "boutique",
]);

export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !GENERIC.has(t));
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice coefficient on character bigrams. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

/** Name similarity in [0, 1]: best of bigram Dice and token containment, ignoring generic words. */
export function nameSimilarity(a: string, b: string): number {
  let ta = normalizeName(a);
  let tb = normalizeName(b);
  // If a name is entirely generic ("The Resort"), fall back to the raw tokens.
  if (!ta.length) ta = a.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tb.length) tb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const dice = diceCoefficient(ta.join(" "), tb.join(" "));
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  const containment = shared / Math.min(ta.length, tb.length);
  return Math.max(dice, containment);
}

export interface MatchCandidate extends LatLng {
  name: string;
}

export interface MatchResult<C extends MatchCandidate> {
  candidate: C;
  confidence: number;
  nameScore: number;
  distanceM: number;
}

export interface MatchOptions {
  maxDistanceM?: number;
  minNameScore?: number;
  minConfidence?: number;
}

/**
 * Match a place to one of a rates provider's listings: must be within `maxDistanceM` (300 m)
 * and have a similar name. Confidence blends name similarity (70%) and proximity (30%).
 */
export function findBestMatch<C extends MatchCandidate>(
  target: MatchCandidate,
  candidates: readonly C[],
  { maxDistanceM = 300, minNameScore = 0.5, minConfidence = 0.6 }: MatchOptions = {},
): MatchResult<C> | null {
  let best: MatchResult<C> | null = null;
  for (const candidate of candidates) {
    const distanceM = haversineKm(target, candidate) * 1000;
    if (distanceM > maxDistanceM) continue;
    const nameScore = nameSimilarity(target.name, candidate.name);
    if (nameScore < minNameScore) continue;
    const confidence = Math.round((0.7 * nameScore + 0.3 * (1 - distanceM / maxDistanceM)) * 1000) / 1000;
    if (confidence < minConfidence) continue;
    if (!best || confidence > best.confidence) best = { candidate, confidence, nameScore, distanceM: Math.round(distanceM) };
  }
  return best;
}
