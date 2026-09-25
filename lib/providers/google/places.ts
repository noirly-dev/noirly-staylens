import { z } from "zod";
import { boundingBox } from "@/lib/geo";
import type { GeoPoint, PlaceDetails, Property } from "@/lib/types";
import { ProviderError, type LodgingSearchParams, type PlacesProvider } from "../types";

const BASE = "https://places.googleapis.com/v1";

const localizedText = z.object({ text: z.string() }).partial();

const placeSchema = z.object({
  id: z.string(),
  displayName: localizedText.optional(),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  types: z.array(z.string()).optional(),
  googleMapsUri: z.string().optional(),
  websiteUri: z.string().optional(),
  allowsDogs: z.boolean().optional(),
  goodForChildren: z.boolean().optional(),
  photos: z
    .array(
      z.object({
        name: z.string(),
        authorAttributions: z.array(z.object({ displayName: z.string().optional(), uri: z.string().optional() })).optional(),
      }),
    )
    .optional(),
});
type GooglePlace = z.infer<typeof placeSchema>;

const searchResponseSchema = z.object({
  places: z.array(placeSchema).optional(),
  nextPageToken: z.string().optional(),
});

const detailsResponseSchema = z.object({
  id: z.string(),
  editorialSummary: localizedText.optional(),
  reviews: z.array(z.object({ text: localizedText.optional() })).optional(),
});

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.allowsDogs",
  "places.goodForChildren",
  "places.photos",
  "nextPageToken",
].join(",");

/** Map a Google place into the normalized Property. Nothing Google-shaped escapes this function. */
export function mapGooglePlace(place: GooglePlace): Property {
  const amenities: string[] = [];
  if (place.allowsDogs) amenities.push("allows_dogs");
  if (place.goodForChildren) amenities.push("good_for_children");
  return {
    id: place.id,
    placeId: place.id,
    name: place.displayName?.text ?? "Unnamed stay",
    lat: place.location.latitude,
    lng: place.location.longitude,
    address: place.formattedAddress,
    rating: place.rating,
    reviewCount: place.userRatingCount,
    photos: (place.photos ?? []).slice(0, 6).map((p) => {
      const author = p.authorAttributions?.[0];
      return {
        url: `/api/photo?name=${encodeURIComponent(p.name)}`,
        attribution: author?.displayName ? { name: author.displayName, uri: author.uri } : undefined,
      };
    }),
    amenities,
    tags: [],
    types: place.types ?? [],
    bookingUrl: place.websiteUri ?? place.googleMapsUri,
    sourceRefs: { google: { id: place.id, url: place.googleMapsUri } },
  };
}

export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit & { fieldMask: string }): Promise<unknown> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": init.fieldMask,
      },
    });
    if (!res.ok) throw new ProviderError(this.name, `${path} failed: ${res.status} ${await res.text()}`, res.status);
    return res.json();
  }

  async searchLodging({ origin, radiusKm, query, limit }: LodgingSearchParams): Promise<Property[]> {
    const { low, high } = boundingBox(origin, radiusKm);
    const results: Property[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    // Text Search returns at most 20 per page and 60 total.
    for (let page = 0; page < 3 && results.length < limit; page++) {
      const body = {
        textQuery: query,
        includedType: "lodging",
        pageSize: 20,
        pageToken,
        locationRestriction: {
          rectangle: {
            low: { latitude: low.lat, longitude: low.lng },
            high: { latitude: high.lat, longitude: high.lng },
          },
        },
      };
      const json = searchResponseSchema.parse(
        await this.request("/places:searchText", { method: "POST", body: JSON.stringify(body), fieldMask: SEARCH_FIELDS }),
      );
      for (const p of json.places ?? []) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        results.push(mapGooglePlace(p));
      }
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    return results.slice(0, limit);
  }

  async getDetails(placeId: string): Promise<PlaceDetails | null> {
    const json = detailsResponseSchema.parse(
      await this.request(`/places/${encodeURIComponent(placeId)}`, { method: "GET", fieldMask: "id,editorialSummary,reviews" }),
    );
    return {
      placeId: json.id,
      description: json.editorialSummary?.text,
      reviews: (json.reviews ?? []).map((r) => r.text?.text).filter((t): t is string => !!t),
    };
  }

  async geocode(query: string): Promise<GeoPoint | null> {
    const json = searchResponseSchema.parse(
      await this.request("/places:searchText", {
        method: "POST",
        body: JSON.stringify({ textQuery: query, pageSize: 1 }),
        fieldMask: "places.id,places.location,places.displayName,places.formattedAddress",
      }),
    );
    const p = json.places?.[0];
    if (!p) return null;
    return { lat: p.location.latitude, lng: p.location.longitude, label: p.formattedAddress ?? p.displayName?.text ?? query };
  }
}

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/** Resolve a Places photo resource name to a short-lived, key-free image URL. */
export async function resolvePhotoUri(apiKey: string, name: string, maxWidthPx = 800, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!PHOTO_NAME.test(name)) return null;
  const url = `${BASE}/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const parsed = z.object({ photoUri: z.string().url() }).safeParse(await res.json());
  return parsed.success ? parsed.data.photoUri : null;
}
