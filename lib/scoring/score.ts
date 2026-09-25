import type { FilterDef, FilterSource, FilterValues } from "@/lib/config/schema";
import type { Property } from "@/lib/types";
import { evaluateFilter, isFilterActive, passesHard, type FilterStatus } from "./evaluate";

export interface BreakdownEntry {
  filterId: string;
  label: string;
  hard: boolean;
  status: FilterStatus;
  passed: boolean;
  /** Points (0–100 scale) this filter contributed to matchScore. Always 0 for hard filters. */
  contribution: number;
  /** Maximum points this filter could have contributed. */
  maxContribution: number;
}

export interface ScoredProperty {
  property: Property;
  matchScore: number;
  breakdown: BreakdownEntry[];
}

export interface HardFilterResult {
  kept: Property[];
  rejected: { property: Property; failed: string[] }[];
}

export function activeFilters(filters: readonly FilterDef[], values: FilterValues): FilterDef[] {
  return filters.filter((f) => isFilterActive(f, values[f.id]));
}

/**
 * Apply active hard filters. When `sources` is given only filters from those sources run,
 * which is how the pipeline applies cheap filters before expensive data is fetched.
 */
export function applyHardFilters(
  properties: readonly Property[],
  filters: readonly FilterDef[],
  values: FilterValues,
  sources?: readonly FilterSource[],
): HardFilterResult {
  const hard = activeFilters(filters, values).filter((f) => f.hard && (!sources || sources.includes(f.source)));
  const result: HardFilterResult = { kept: [], rejected: [] };
  for (const property of properties) {
    const failed = hard.filter((f) => !passesHard(f, evaluateFilter(f, values[f.id], property))).map((f) => f.id);
    if (failed.length) result.rejected.push({ property, failed });
    else result.kept.push(property);
  }
  return result;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Weighted score in 0–100 over active soft filters, with a per-filter breakdown that also
 * lists hard filters (pass/fail, zero contribution). With no active soft filters the score is 100.
 */
export function scoreProperty(property: Property, filters: readonly FilterDef[], values: FilterValues): ScoredProperty {
  const active = activeFilters(filters, values);
  const totalWeight = active.reduce((sum, f) => sum + (f.hard ? 0 : (f.weight ?? 0)), 0);
  let raw = 0;
  const breakdown = active.map((f): BreakdownEntry => {
    const evaluation = evaluateFilter(f, values[f.id], property);
    if (f.hard) {
      return {
        filterId: f.id,
        label: f.label,
        hard: true,
        status: evaluation.status,
        passed: passesHard(f, evaluation),
        contribution: 0,
        maxContribution: 0,
      };
    }
    const max = totalWeight > 0 ? (100 * (f.weight ?? 0)) / totalWeight : 0;
    const contribution = max * evaluation.score;
    raw += contribution;
    return {
      filterId: f.id,
      label: f.label,
      hard: false,
      status: evaluation.status,
      passed: evaluation.status === "pass",
      contribution: round1(contribution),
      maxContribution: round1(max),
    };
  });
  return { property, matchScore: totalWeight > 0 ? Math.round(raw) : 100, breakdown };
}

/** Sort: matchScore desc, then rating desc, then drive time asc, then name for stability. */
export function compareScored(a: ScoredProperty, b: ScoredProperty): number {
  return (
    b.matchScore - a.matchScore ||
    (b.property.rating ?? 0) - (a.property.rating ?? 0) ||
    (a.property.driveTimeMin ?? Infinity) - (b.property.driveTimeMin ?? Infinity) ||
    a.property.name.localeCompare(b.property.name)
  );
}

export function rankProperties(
  properties: readonly Property[],
  filters: readonly FilterDef[],
  values: FilterValues,
): ScoredProperty[] {
  return properties.map((p) => scoreProperty(p, filters, values)).sort(compareScored);
}
