import { z } from "zod";
import { findBestMatch } from "@/lib/matching";
import type { Property, RateQuote } from "@/lib/types";
import { ProviderError, type RatesProvider } from "./types";

const SERPAPI_URL = "https://serpapi.com/search.json";

const serpPropertySchema = z.object({
  name: z.string(),
  property_token: z.string().optional(),
  link: z.string().optional(),
  gps_coordinates: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  rate_per_night: z.object({ extracted_lowest: z.number().optional(), lowest: z.string().optional() }).optional(),
  amenities: z.array(z.string()).optional(),
});
type SerpProperty = z.infer<typeof serpPropertySchema>;

/** Either a list of properties, or — when the query matched one property — its details at the top level. */
const serpResponseSchema = z
  .object({
    error: z.string().optional(),
    properties: z.array(z.unknown()).optional(),
    name: z.string().optional(),
  })
  .loose();

export interface EntityMatchSink {
  record(entry: {
    placeId: string;
    provider: string;
    providerPropertyId: string;
    providerName: string;
    lat: number;
    lng: number;
    confidence: number;
  }): Promise<void>;
}

export function parseSerpCandidates(json: unknown): SerpProperty[] {
  const parsed = serpResponseSchema.parse(json);
  const raw = parsed.properties ?? (parsed.name ? [parsed] : []);
  return raw.flatMap((r) => {
    const p = serpPropertySchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

export class SerpApiRatesProvider implements RatesProvider {
  readonly name = "serpapi";

  constructor(
    private readonly apiKey: string,
    private readonly options: { currency: string; gl?: string; fetchImpl?: typeof fetch; matches?: EntityMatchSink } = { currency: "INR" },
  ) {}

  async getRates(property: Property, checkIn: string, checkOut: string, guests: number): Promise<RateQuote | null> {
    const params = new URLSearchParams({
      engine: "google_hotels",
      q: [property.name, property.address].filter(Boolean).join(", "),
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: String(guests),
      currency: this.options.currency,
      gl: this.options.gl ?? "in",
      hl: "en",
      api_key: this.apiKey,
    });
    const res = await (this.options.fetchImpl ?? fetch)(`${SERPAPI_URL}?${params}`);
    if (!res.ok) throw new ProviderError(this.name, `search failed: ${res.status}`, res.status);
    const json: unknown = await res.json();
    const error = serpResponseSchema.safeParse(json);
    if (error.success && error.data.error) {
      // "Google Hotels hasn't returned any results" is a normal miss, not a failure.
      if (/no results|hasn't returned any results/i.test(error.data.error)) return null;
      throw new ProviderError(this.name, error.data.error);
    }

    const candidates = parseSerpCandidates(json)
      .filter((c) => c.gps_coordinates && c.rate_per_night?.extracted_lowest !== undefined)
      .map((c) => ({ ...c, lat: c.gps_coordinates!.latitude, lng: c.gps_coordinates!.longitude }));
    const match = findBestMatch(property, candidates);
    if (!match) return null;

    const c = match.candidate;
    const providerPropertyId = c.property_token ?? c.name;
    await this.options.matches
      ?.record({
        placeId: property.placeId,
        provider: this.name,
        providerPropertyId,
        providerName: c.name,
        lat: c.lat,
        lng: c.lng,
        confidence: match.confidence,
      })
      .catch((err) => console.warn("[serpapi] failed to persist entity match", err));

    return {
      nightlyRate: c.rate_per_night!.extracted_lowest!,
      currency: this.options.currency,
      url: c.link ?? `https://www.google.com/travel/search?q=${encodeURIComponent(c.name)}`,
      providerPropertyId,
      confidence: match.confidence,
      amenities: c.amenities,
    };
  }
}
