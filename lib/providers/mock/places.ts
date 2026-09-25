import { destinationPoint, haversineKm } from "@/lib/geo";
import type { GeoPoint, LatLng, PlaceDetails, Property } from "@/lib/types";
import { hashString, seededRandom } from "@/lib/util/hash";
import type { LodgingSearchParams, PlacesProvider } from "../types";
import { AMENITIES, CITIES, DESCRIPTION_PHRASES, NAME_PREFIXES, REVIEW_PHRASES, STAY_KINDS } from "./data";

interface MockPlace {
  property: Property;
  details: PlaceDetails;
  /** Used by the mock rates provider to price realistically. */
  basePrice: number;
}

const WORLD_SIZE = 90;
const WORLD_RADIUS_KM = 280;

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

/**
 * Deterministic offline "world" of stays around an origin. The same origin always yields
 * the same places, so the full pipeline can be developed and tested without any API key.
 */
export function generateMockWorld(origin: LatLng, size = WORLD_SIZE): MockPlace[] {
  const anchor = { lat: Math.round(origin.lat * 10) / 10, lng: Math.round(origin.lng * 10) / 10 };
  const seed = `${anchor.lat},${anchor.lng}`;
  const rand = seededRandom(seed);
  const places: MockPlace[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < size; i++) {
    const kind = pick(rand, STAY_KINDS);
    let name = `${pick(rand, NAME_PREFIXES)} ${kind.suffix}`;
    if (usedNames.has(name)) name = `${name} ${i}`;
    usedNames.add(name);

    const distance = 8 + (WORLD_RADIUS_KM - 8) * Math.pow(rand(), 1.4);
    const point = destinationPoint(anchor, distance, rand() * 360);
    const placeId = `mock_${hashString(`${seed}:${i}`).toString(36)}`;

    const amenities = AMENITIES.filter((a) => rand() < a.p).map((a) => a.name);
    if (kind.suffix === "Pool Villa" && !amenities.includes("Private pool")) amenities.push("Private pool");
    const phrases = DESCRIPTION_PHRASES.filter((d) => rand() < d.p).map((d) => d.text);
    if (kind.suffix === "Pool Villa") phrases.push("Each villa has a private plunge pool.");
    const reviews = REVIEW_PHRASES.filter(() => rand() < 0.3);
    const rating = Math.round((3.4 + rand() * 1.5) * 10) / 10;

    places.push({
      basePrice: kind.base,
      details: { placeId, description: `${name}. ${phrases.join(" ")}`.trim(), reviews },
      property: {
        id: placeId,
        placeId,
        name,
        lat: point.lat,
        lng: point.lng,
        rating,
        reviewCount: Math.floor(10 + rand() * 1800),
        photos: [],
        amenities,
        tags: [],
        types: [...kind.types],
        bookingUrl: `https://www.google.com/travel/search?q=${encodeURIComponent(name)}`,
        sourceRefs: { mock: { id: placeId } },
      },
    });
  }
  return places;
}

export class MockPlacesProvider implements PlacesProvider {
  readonly name = "mock";
  private readonly index = new Map<string, MockPlace>();

  async searchLodging({ origin, radiusKm, limit }: LodgingSearchParams): Promise<Property[]> {
    const world = generateMockWorld(origin);
    for (const place of world) this.index.set(place.property.placeId, place);
    return world
      .filter((p) => haversineKm(origin, p.property) <= radiusKm)
      .sort((a, b) => (b.property.rating ?? 0) - (a.property.rating ?? 0))
      .slice(0, limit)
      .map((p) => structuredClone(p.property));
  }

  async getDetails(placeId: string): Promise<PlaceDetails | null> {
    return this.index.get(placeId)?.details ?? null;
  }

  basePriceFor(placeId: string): number | undefined {
    return this.index.get(placeId)?.basePrice;
  }

  async geocode(query: string): Promise<GeoPoint | null> {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const coords = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coords) return { lat: Number(coords[1]), lng: Number(coords[2]), label: query.trim() };
    const city = CITIES.find((c) => c.names.some((n) => q === n || q.startsWith(`${n},`) || q.startsWith(`${n} `)));
    return city ? { lat: city.lat, lng: city.lng, label: city.label } : null;
  }
}
