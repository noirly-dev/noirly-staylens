import { cached, TTL, type KvCache } from "@/lib/cache";
import type { GeoPoint, PlaceDetails, Property, RateQuote } from "@/lib/types";
import type { LodgingSearchParams, PlacesProvider, RatesProvider } from "./types";

type CachedQuote = { quote: RateQuote | null };

export function rateCacheKey(provider: string, placeId: string, checkIn: string, checkOut: string, guests: number) {
  return `rates:v1:${provider}:${placeId}:${checkIn}:${checkOut}:${guests}`;
}

/** Rates cached for 30 min keyed by placeId + dates + guests. Misses are cached too. */
export class CachedRatesProvider implements RatesProvider {
  readonly name: string;
  constructor(
    private readonly inner: RatesProvider,
    private readonly cache: KvCache,
    private readonly ttlSeconds = TTL.rates,
  ) {
    this.name = inner.name;
  }

  async getRates(property: Property, checkIn: string, checkOut: string, guests: number): Promise<RateQuote | null> {
    const key = rateCacheKey(this.inner.name, property.placeId, checkIn, checkOut, guests);
    const hit = await cached<CachedQuote>(this.cache, key, this.ttlSeconds, async () => ({
      quote: await this.inner.getRates(property, checkIn, checkOut, guests),
    }));
    return hit.quote;
  }
}

/**
 * Short-lived cache of places responses. Per Google Maps Platform terms only place IDs may be
 * kept long-term, so search/geocode results expire quickly and details are never cached here.
 */
export class CachedPlacesProvider implements PlacesProvider {
  readonly name: string;
  constructor(
    private readonly inner: PlacesProvider,
    private readonly cache: KvCache,
  ) {
    this.name = inner.name;
  }

  searchLodging(params: LodgingSearchParams): Promise<Property[]> {
    const { origin, radiusKm, query, limit } = params;
    const key = `places:v1:${this.inner.name}:${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}:${Math.round(radiusKm)}:${limit}:${query}`;
    return cached(this.cache, key, TTL.places, () => this.inner.searchLodging(params));
  }

  getDetails(placeId: string): Promise<PlaceDetails | null> {
    return this.inner.getDetails(placeId);
  }

  async geocode(query: string): Promise<GeoPoint | null> {
    const key = `geocode:v1:${this.inner.name}:${query.trim().toLowerCase()}`;
    const hit = await cached(this.cache, key, TTL.geocode, async () => ({ point: await this.inner.geocode(query) }));
    return hit.point;
  }
}
