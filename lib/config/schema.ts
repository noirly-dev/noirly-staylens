import { z } from "zod";

/** Where a filter's data comes from. Also decides at which pipeline stage a hard filter runs. */
export const FILTER_SOURCES = ["rates", "places", "routes", "enrichment"] as const;
export type FilterSource = (typeof FILTER_SOURCES)[number];

/** Numeric Property fields a range filter can read, and the source that populates each. */
export const NUMERIC_FIELD_SOURCES = {
  nightlyRate: "rates",
  driveTimeMin: "routes",
  rating: "places",
  reviewCount: "places",
} as const satisfies Record<string, FilterSource>;
export type NumericField = keyof typeof NUMERIC_FIELD_SOURCES;
const NUMERIC_FIELDS = Object.keys(NUMERIC_FIELD_SOURCES) as [NumericField, ...NumericField[]];

/** Property collections a term-matching filter (bool / llm_tag / enum) looks at. */
export const MATCH_TARGETS = ["amenities", "tags", "types", "name"] as const;
export type MatchTarget = (typeof MATCH_TARGETS)[number];

const idSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "ids must be snake_case");

const baseFilter = {
  id: idSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  group: z.string().default("Other"),
  source: z.enum(FILTER_SOURCES),
  /** Hard filters exclude non-matching properties. Mutually exclusive with `weight`. */
  hard: z.boolean().default(false),
  /** Weighted (soft) filters contribute to matchScore, 0–1. Required when not hard. */
  weight: z.number().min(0).max(1).optional(),
  unit: z.string().optional(),
  /** When a hard filter can't be evaluated (missing data), keep the property instead of excluding it. */
  allowUnknown: z.boolean().default(false),
};

const termFields = {
  /** Canonical term to match; defaults to the filter id. */
  key: z.string().optional(),
  /** Extra terms that count as a match (provider amenity strings, review phrases, …). */
  synonyms: z.array(z.string().min(1)).default([]),
  matchOn: z.array(z.enum(MATCH_TARGETS)).min(1).default(["amenities", "tags"]),
};

export const rangeValueSchema = z.object({
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
});
export type RangeValue = z.infer<typeof rangeValueSchema>;

export const rangeFilterSchema = z.object({
  ...baseFilter,
  type: z.literal("range"),
  field: z.enum(NUMERIC_FIELDS),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  /** How far outside the range a value can be before its soft score reaches 0. */
  tolerance: z.number().positive().optional(),
  default: rangeValueSchema.default({ min: null, max: null }),
});

export const boolFilterSchema = z.object({
  ...baseFilter,
  ...termFields,
  type: z.literal("bool"),
  default: z.boolean().default(false),
});

export const llmTagFilterSchema = z.object({
  ...baseFilter,
  ...termFields,
  type: z.literal("llm_tag"),
  source: z.literal("enrichment"),
  matchOn: z.array(z.enum(MATCH_TARGETS)).min(1).default(["tags"]),
  default: z.boolean().default(false),
});

export const enumOptionSchema = z.object({
  value: idSchema,
  label: z.string().min(1),
  synonyms: z.array(z.string().min(1)).default([]),
});

export const enumFilterSchema = z.object({
  ...baseFilter,
  type: z.literal("enum"),
  options: z.array(enumOptionSchema).min(1),
  matchOn: z.array(z.enum(MATCH_TARGETS)).min(1).default(["amenities", "tags", "types"]),
  default: z.string().nullable().default(null),
});

export const filterSchema = z
  .discriminatedUnion("type", [rangeFilterSchema, boolFilterSchema, llmTagFilterSchema, enumFilterSchema])
  .superRefine((f, ctx) => {
    if (f.hard && f.weight !== undefined) {
      ctx.addIssue({ code: "custom", message: `filter "${f.id}": hard filters must not set a weight`, path: ["weight"] });
    }
    if (!f.hard && f.weight === undefined) {
      ctx.addIssue({ code: "custom", message: `filter "${f.id}": soft filters need a weight (0–1)`, path: ["weight"] });
    }
    if (f.type === "range") {
      if (f.min >= f.max) ctx.addIssue({ code: "custom", message: `filter "${f.id}": min must be < max`, path: ["min"] });
      if (NUMERIC_FIELD_SOURCES[f.field] !== f.source) {
        ctx.addIssue({
          code: "custom",
          message: `filter "${f.id}": field "${f.field}" comes from source "${NUMERIC_FIELD_SOURCES[f.field]}", not "${f.source}"`,
          path: ["source"],
        });
      }
    }
    if (f.type === "enum") {
      const values = f.options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
        ctx.addIssue({ code: "custom", message: `filter "${f.id}": duplicate option values`, path: ["options"] });
      }
      if (f.default !== null && !values.includes(f.default)) {
        ctx.addIssue({ code: "custom", message: `filter "${f.id}": default is not an option`, path: ["default"] });
      }
    }
  });

export const searchSettingsSchema = z.object({
  /** Free-text query sent to the places provider for candidate lodging. */
  placesQuery: z.string().default("resorts villas homestays"),
  defaultRadiusKm: z.number().positive().default(100),
  maxRadiusKm: z.number().positive().default(300),
  /** Assumed straight-line speed used to turn a max drive time into a search radius. */
  radiusSpeedKmh: z.number().positive().default(70),
  candidateLimit: z.number().int().positive().max(200).default(60),
  /** Rates are fetched for at most this many shortlisted properties per search. */
  maxRateFetches: z.number().int().positive().max(25).default(25),
});

export const filterConfigSchema = z
  .object({
    version: z.literal(1),
    currency: z.string().length(3).default("INR"),
    search: searchSettingsSchema.default(searchSettingsSchema.parse({})),
    filters: z.array(filterSchema).min(1),
  })
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.filters.forEach((f, i) => {
      if (seen.has(f.id)) ctx.addIssue({ code: "custom", message: `duplicate filter id "${f.id}"`, path: ["filters", i, "id"] });
      seen.add(f.id);
    });
  });

export type FilterConfig = z.infer<typeof filterConfigSchema>;
export type FilterDef = z.infer<typeof filterSchema>;
export type RangeFilterDef = z.infer<typeof rangeFilterSchema>;
export type BoolFilterDef = z.infer<typeof boolFilterSchema>;
export type LlmTagFilterDef = z.infer<typeof llmTagFilterSchema>;
export type EnumFilterDef = z.infer<typeof enumFilterSchema>;
export type TermFilterDef = BoolFilterDef | LlmTagFilterDef;
export type SearchSettings = z.infer<typeof searchSettingsSchema>;

export type FilterValue = RangeValue | boolean | string | null;
export type FilterValues = Record<string, FilterValue>;
