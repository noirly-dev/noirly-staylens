import { geometry, index, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Only Google place IDs are stored long-term (Google Maps Platform terms). Everything else
 * here is derived data (tags) or rates-provider data (entity matches).
 */
export const enrichments = pgTable("enrichments", {
  placeId: text("place_id").primaryKey(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  /** Hash of the tag vocabulary the tags were computed against; a change triggers recompute. */
  vocabHash: text("vocab_hash").notNull(),
  model: text("model").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Rates-provider listing ↔ place matches, with the rates provider's own coordinates. */
export const entityMatches = pgTable(
  "entity_matches",
  {
    placeId: text("place_id").notNull(),
    provider: text("provider").notNull(),
    providerPropertyId: text("provider_property_id").notNull(),
    providerName: text("provider_name").notNull(),
    /** WGS84 lon/lat (x = lng, y = lat). */
    location: geometry("location", { type: "point", mode: "xy" }).notNull(),
    confidence: real("confidence").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.provider] }), index("entity_matches_location_idx").using("gist", t.location)],
);
