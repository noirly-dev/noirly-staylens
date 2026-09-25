import { parseFilterConfig, type FilterConfig } from "@/lib/config";
import type { Property } from "@/lib/types";

export function makeProperty(overrides: Partial<Property> = {}): Property {
  const id = overrides.placeId ?? overrides.id ?? "p1";
  return {
    id,
    placeId: id,
    name: "Test Stay",
    lat: 12.9,
    lng: 77.6,
    rating: 4.5,
    reviewCount: 200,
    photos: [],
    amenities: [],
    tags: [],
    types: [],
    sourceRefs: {},
    ...overrides,
  };
}

export function makeConfig(filters: unknown[], extra: Record<string, unknown> = {}): FilterConfig {
  return parseFilterConfig({ version: 1, filters, ...extra });
}

export const rangeFilter = (over: Record<string, unknown> = {}) => ({
  id: "price",
  label: "Price",
  type: "range",
  source: "rates",
  field: "nightlyRate",
  hard: true,
  unit: "INR",
  min: 0,
  max: 50000,
  step: 500,
  ...over,
});

export const boolFilter = (over: Record<string, unknown> = {}) => ({
  id: "pool",
  label: "Pool",
  type: "bool",
  source: "places",
  weight: 0.5,
  synonyms: ["swimming pool"],
  ...over,
});
