import { z } from "zod";
import { buildFilterValuesSchema, type FilterConfig } from "@/lib/config";
import { geoPointSchema } from "@/lib/types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export function buildSearchRequestSchema(config: FilterConfig) {
  return z
    .object({
      origin: geoPointSchema,
      checkIn: isoDate,
      checkOut: isoDate,
      guests: z.number().int().min(1).max(20).default(2),
      filters: buildFilterValuesSchema(config).default({}),
    })
    .refine((r) => r.checkOut > r.checkIn, { message: "checkOut must be after checkIn", path: ["checkOut"] });
}

export type SearchRequest = z.infer<ReturnType<typeof buildSearchRequestSchema>>;
