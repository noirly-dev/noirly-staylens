import type { FilterConfig, FilterValues, RangeFilterDef } from "@/lib/config/schema";
import { containsTerm } from "@/lib/scoring/terms";

export interface ParsedQuery {
  filters: FilterValues;
  originText: string | null;
}

const NEGATORS = ["no", "not", "without", "non"];

function mentions(text: string, term: string): boolean {
  return containsTerm(text, term) && !NEGATORS.some((n) => containsTerm(text, `${n} ${term}`));
}

function toNumber(raw: string, suffix?: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, ""));
  const s = suffix?.toLowerCase();
  if (s === "k" || s === "thousand") return n * 1000;
  if (s === "lakh" || s === "l") return n * 100000;
  return n;
}

const rangeByUnit = (config: FilterConfig, unit: string): RangeFilterDef | undefined =>
  config.filters.find((f): f is RangeFilterDef => f.type === "range" && f.unit === unit);

/**
 * Offline parser. Everything it can recognise is derived from config: duration phrases map to
 * the range filter with unit "min", money to the one whose unit is the config currency, star
 * ratings to unit "★", and term filters/enum options by label, id and synonyms.
 */
export function parseQueryHeuristic(input: string, config: FilterConfig): ParsedQuery {
  const filters: FilterValues = {};
  let text = ` ${input.toLowerCase()} `;

  const duration = rangeByUnit(config, "min");
  if (duration) {
    const re = /(?:within|under|less than|up ?to|max(?:imum)?|<)?\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/g;
    const m = re.exec(text);
    if (m) {
      const n = Number.parseFloat(m[1]!);
      filters[duration.id] = { min: null, max: Math.round(/^h/.test(m[2]!) ? n * 60 : n) };
      text = text.replace(m[0], " ");
    }
  }

  const stars = rangeByUnit(config, "★");
  if (stars) {
    const m = /(\d(?:\.\d)?)\s*(?:\+|stars?|★|rated)/.exec(text);
    if (m) {
      filters[stars.id] = { min: Number.parseFloat(m[1]!), max: null };
      text = text.replace(m[0], " ");
    }
  }

  const money = rangeByUnit(config, config.currency);
  if (money) {
    const amount = String.raw`(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh)?`;
    const between = new RegExp(String.raw`(?:between\s+)?${amount}\s*(?:-|to|and)\s*${amount}`).exec(text);
    const below = new RegExp(String.raw`(?:under|below|less than|up ?to|max(?:imum)?|within|budget(?: of)?|<)\s*${amount}`).exec(text);
    const above = new RegExp(String.raw`(?:over|above|more than|at least|min(?:imum)?|>)\s*${amount}`).exec(text);
    const bare = /(?:₹|rs\.?|inr)\s*(\d[\d,]*)\s*(k|thousand|lakh)?|(\d+(?:\.\d+)?)\s*(k)\b/.exec(text);
    if (between && (between[2] || between[4] || /₹|rs|inr/.test(between[0]))) {
      const hiSuffix = between[4] ?? between[2];
      filters[money.id] = { min: toNumber(between[1]!, between[2] ?? hiSuffix), max: toNumber(between[3]!, hiSuffix) };
    } else if (below) {
      filters[money.id] = { min: null, max: toNumber(below[1]!, below[2]) };
    } else if (above) {
      filters[money.id] = { min: toNumber(above[1]!, above[2]), max: null };
    } else if (bare) {
      filters[money.id] = { min: null, max: bare[1] ? toNumber(bare[1], bare[2]) : toNumber(bare[3]!, bare[4]) };
    }
  }

  for (const f of config.filters) {
    if (f.type === "bool" || f.type === "llm_tag") {
      const terms = [(f.key ?? f.id).replace(/_/g, " "), f.label, ...f.synonyms];
      if (terms.some((t) => mentions(text, t))) filters[f.id] = true;
    } else if (f.type === "enum") {
      const option = f.options.find((o) => [o.value, o.label, ...o.synonyms].some((t) => mentions(text, t)));
      if (option) filters[f.id] = option.value;
    }
  }

  const origin =
    /\b(?:from|near|around)\s+([a-z][a-z .'-]*?)(?=\s*(?:[,.;!?]|$|\b(?:with|and|under|within|for|in|that|having|below|less|max)\b))/i.exec(
      input,
    );
  return { filters, originText: origin?.[1]?.trim() || null };
}
