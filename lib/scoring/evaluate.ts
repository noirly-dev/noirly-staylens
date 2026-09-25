import type { EnumFilterDef, FilterDef, FilterValue, RangeFilterDef, RangeValue, TermFilterDef } from "@/lib/config/schema";
import type { Property } from "@/lib/types";
import { matchesAnyTerm, valuesFor } from "./terms";

export type FilterStatus = "pass" | "fail" | "unknown";

export interface FilterEvaluation {
  status: FilterStatus;
  /** Soft score in [0, 1]. 1 = fully satisfied. */
  score: number;
}

function isRangeValue(v: FilterValue | undefined): v is RangeValue {
  return typeof v === "object" && v !== null;
}

/** A filter only participates in scoring when the user has actually constrained it. */
export function isFilterActive(filter: FilterDef, value: FilterValue | undefined): boolean {
  switch (filter.type) {
    case "range":
      return isRangeValue(value) && (value.min !== null || value.max !== null);
    case "bool":
    case "llm_tag":
      return value === true;
    case "enum":
      return typeof value === "string" && filter.options.some((o) => o.value === value);
  }
}

export function termsFor(filter: TermFilterDef): string[] {
  return [filter.key ?? filter.id, ...filter.synonyms];
}

export function evaluateRange(filter: RangeFilterDef, value: RangeValue, property: Property): FilterEvaluation {
  const actual = property[filter.field];
  if (actual === undefined || Number.isNaN(actual)) return { status: "unknown", score: 0 };
  const { min, max } = value;
  if ((min === null || actual >= min) && (max === null || actual <= max)) return { status: "pass", score: 1 };
  const bound = min !== null && actual < min ? min : (max as number);
  const deviation = Math.abs(actual - bound);
  const tolerance = filter.tolerance ?? Math.max(Math.abs(bound) * 0.25, filter.step);
  return { status: "fail", score: Math.max(0, 1 - deviation / tolerance) };
}

export function evaluateTerms(filter: TermFilterDef, property: Property): FilterEvaluation {
  const hit = matchesAnyTerm(valuesFor(property, filter.matchOn), termsFor(filter));
  return hit ? { status: "pass", score: 1 } : { status: "fail", score: 0 };
}

export function evaluateEnum(filter: EnumFilterDef, value: string, property: Property): FilterEvaluation {
  const option = filter.options.find((o) => o.value === value);
  if (!option) return { status: "unknown", score: 0 };
  const hit = matchesAnyTerm(valuesFor(property, filter.matchOn), [option.value, ...option.synonyms]);
  return hit ? { status: "pass", score: 1 } : { status: "fail", score: 0 };
}

/** Evaluate one active filter against a property. Callers should check isFilterActive first. */
export function evaluateFilter(filter: FilterDef, value: FilterValue | undefined, property: Property): FilterEvaluation {
  switch (filter.type) {
    case "range":
      return isRangeValue(value) ? evaluateRange(filter, value, property) : { status: "unknown", score: 0 };
    case "bool":
    case "llm_tag":
      return evaluateTerms(filter, property);
    case "enum":
      return typeof value === "string" ? evaluateEnum(filter, value, property) : { status: "unknown", score: 0 };
  }
}

export function passesHard(filter: FilterDef, evaluation: FilterEvaluation): boolean {
  return evaluation.status === "pass" || (evaluation.status === "unknown" && filter.allowUnknown);
}
