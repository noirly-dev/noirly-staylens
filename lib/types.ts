import { z } from "zod";

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

export const geoPointSchema = latLngSchema.extend({ label: z.string().optional() });
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const photoSchema = z.object({
  url: z.string(),
  attribution: z.object({ name: z.string(), uri: z.string().optional() }).optional(),
});
export type Photo = z.infer<typeof photoSchema>;

export const sourceRefSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  /** Entity-match confidence (0–1) when this ref was matched rather than native. */
  confidence: z.number().min(0).max(1).optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/**
 * The single normalized property model. Every provider adapter maps into this;
 * no provider-specific shapes are allowed past the adapter layer.
 */
export const propertySchema = z.object({
  id: z.string(),
  placeId: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  photos: z.array(photoSchema),
  /** Raw amenity strings from providers (e.g. "Free Wi-Fi", "allows_dogs"). */
  amenities: z.array(z.string()),
  /** Derived vibe/attribute tags from the enrichment pipeline. */
  tags: z.array(z.string()),
  /** Provider place types (e.g. "resort_hotel", "farmstay"). */
  types: z.array(z.string()),
  nightlyRate: z.number().optional(),
  currency: z.string().optional(),
  driveTimeMin: z.number().optional(),
  distanceKm: z.number().optional(),
  /** Outbound "view on provider" link. */
  bookingUrl: z.string().optional(),
  sourceRefs: z.record(z.string(), sourceRefSchema),
});
export type Property = z.infer<typeof propertySchema>;

/** Text used by the enrichment pipeline. Fetched on demand, never persisted. */
export interface PlaceDetails {
  placeId: string;
  description?: string;
  reviews: string[];
}

export interface RateQuote {
  nightlyRate: number;
  currency: string;
  url?: string;
  providerPropertyId: string;
  /** Entity-match confidence between the rates-provider listing and the place (0–1). */
  confidence: number;
  amenities?: string[];
}

export interface StayDates {
  checkIn: string;
  checkOut: string;
  guests: number;
}
