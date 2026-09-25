import type { GeoPoint, LatLng, PlaceDetails, Property, RateQuote } from "@/lib/types";

export interface LodgingSearchParams {
  origin: LatLng;
  radiusKm: number;
  query: string;
  limit: number;
}

export interface PlacesProvider {
  readonly name: string;
  /** Candidate lodging around `origin`. Returns normalized properties (no rates, no drive time). */
  searchLodging(params: LodgingSearchParams): Promise<Property[]>;
  /** Description + review text for enrichment. Not persisted. */
  getDetails(placeId: string): Promise<PlaceDetails | null>;
  geocode(query: string): Promise<GeoPoint | null>;
}

export interface RoutesProvider {
  readonly name: string;
  /** Drive time in minutes from origin to each destination (null when no route). Same order as input. */
  driveTimes(origin: LatLng, destinations: readonly LatLng[]): Promise<(number | null)[]>;
}

export interface RatesProvider {
  readonly name: string;
  getRates(property: Property, checkIn: string, checkOut: string, guests: number): Promise<RateQuote | null>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}
