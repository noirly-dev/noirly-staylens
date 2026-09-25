import type { ScoredProperty } from "@/lib/scoring/score";

export function markerLabel(r: ScoredProperty): string {
  const p = r.property;
  if (p.nightlyRate !== undefined) return p.nightlyRate >= 1000 ? `₹${(p.nightlyRate / 1000).toFixed(1)}k` : `₹${p.nightlyRate}`;
  return `${r.matchScore}%`;
}
