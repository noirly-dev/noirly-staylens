import { resolveFilterValues, type FilterConfig, type FilterValues, type RangeValue } from "@/lib/config";
import type { EnrichmentService, EnrichmentStats } from "@/lib/enrichment/service";
import { haversineKm } from "@/lib/geo";
import type { PlacesProvider, RatesProvider, RoutesProvider } from "@/lib/providers/types";
import { activeFilters, applyHardFilters, rankProperties, scoreProperty, compareScored, type ScoredProperty } from "@/lib/scoring";
import type { GeoPoint, Property } from "@/lib/types";
import { mapLimit } from "@/lib/util/concurrency";
import type { SearchRequest } from "./request";

export interface SearchDeps {
  config: FilterConfig;
  places: PlacesProvider;
  routes: RoutesProvider;
  rates: RatesProvider;
  enrichment: EnrichmentService;
}

export interface StageCount {
  stage: string;
  count: number;
  excluded: number;
}

export interface SearchResponse {
  results: ScoredProperty[];
  meta: {
    origin: GeoPoint;
    radiusKm: number;
    stages: StageCount[];
    ratesFetched: number;
    /** Why properties were excluded, by filter id. */
    exclusions: Record<string, number>;
    enrichment: EnrichmentStats;
    providers: { places: string; routes: string; rates: string; enrichment: string };
    /** True when any displayed data came from Google Places (map + attribution required). */
    googleAttribution: boolean;
    durationMs: number;
  };
}

/** Search radius from the tightest max drive time filter, else the config default. */
export function searchRadiusKm(config: FilterConfig, values: FilterValues): number {
  const s = config.search;
  const maxDrive = config.filters
    .filter((f) => f.type === "range" && f.field === "driveTimeMin")
    .map((f) => (values[f.id] as RangeValue | undefined)?.max)
    .filter((m): m is number => typeof m === "number");
  if (!maxDrive.length) return s.defaultRadiusKm;
  return Math.min(s.maxRadiusKm, Math.max(5, (Math.min(...maxDrive) / 60) * s.radiusSpeedKmh));
}

/**
 * Cost-ordered search:
 *  a. geo candidates (places)  b. drive-time hard filters (routes)
 *  c. attribute + enrichment hard filters  d. rates for the shortlist only (≤ maxRateFetches)
 *  e. price hard filters  f. weighted scoring.
 */
export async function runSearch(request: SearchRequest, deps: SearchDeps): Promise<SearchResponse> {
  const started = Date.now();
  const { config, places, routes, rates, enrichment } = deps;
  const values = resolveFilterValues(config, request.filters);
  const filters = config.filters;
  const active = activeFilters(filters, values);
  const stages: StageCount[] = [];
  const exclusions: Record<string, number> = {};
  const track = (stage: string, kept: number, rejected: { failed: string[] }[] = []) => {
    stages.push({ stage, count: kept, excluded: rejected.length });
    for (const r of rejected) for (const id of r.failed) exclusions[id] = (exclusions[id] ?? 0) + 1;
  };

  // a. Geo candidate fetch
  const radiusKm = searchRadiusKm(config, values);
  let candidates: Property[] = (
    await places.searchLodging({ origin: request.origin, radiusKm, query: config.search.placesQuery, limit: config.search.candidateLimit })
  ).map((p) => ({ ...p, distanceKm: Math.round(haversineKm(request.origin, p) * 10) / 10 }));
  track("candidates", candidates.length);

  // b. Drive time
  if (candidates.length) {
    const times = await routes.driveTimes(request.origin, candidates);
    candidates = candidates.map((p, i) => {
      const t = times[i];
      return t === null || t === undefined ? p : { ...p, driveTimeMin: t };
    });
  }
  const afterRoutes = applyHardFilters(candidates, filters, values, ["routes"]);
  track("drive_time", afterRoutes.kept.length, afterRoutes.rejected);

  // c. Attribute hard filters, then enrichment, then enrichment hard filters
  const afterPlaces = applyHardFilters(afterRoutes.kept, filters, values, ["places"]);
  track("attributes", afterPlaces.kept.length, afterPlaces.rejected);

  const needsEnrichment = active.some((f) => f.source === "enrichment");
  const enriched = await enrichment.enrich(afterPlaces.kept, places, { compute: needsEnrichment });
  const afterEnrichment = applyHardFilters(enriched.properties, filters, values, ["enrichment"]);
  track("enrichment", afterEnrichment.kept.length, afterEnrichment.rejected);

  // d. Rates for the shortlist only — best preliminary scores first
  const shortlist = afterEnrichment.kept
    .map((p) => scoreProperty(p, filters, values))
    .sort(compareScored)
    .slice(0, config.search.maxRateFetches)
    .map((s) => s.property);
  const priced = await mapLimit(shortlist, 5, async (p): Promise<Property> => {
    const quote = await rates.getRates(p, request.checkIn, request.checkOut, request.guests).catch((err) => {
      console.warn(`[search] rates failed for ${p.placeId}`, err);
      return null;
    });
    if (!quote) return p;
    return {
      ...p,
      nightlyRate: quote.nightlyRate,
      currency: quote.currency,
      bookingUrl: quote.url ?? p.bookingUrl,
      amenities: quote.amenities ? [...new Set([...p.amenities, ...quote.amenities])] : p.amenities,
      sourceRefs: { ...p.sourceRefs, [rates.name]: { id: quote.providerPropertyId, url: quote.url, confidence: quote.confidence } },
    };
  });
  track("shortlist", priced.length, []);

  // e. Price hard filters
  const afterRates = applyHardFilters(priced, filters, values, ["rates"]);
  track("price", afterRates.kept.length, afterRates.rejected);

  // f. Weighted scoring
  const results = rankProperties(afterRates.kept, filters, values);

  return {
    results,
    meta: {
      origin: request.origin,
      radiusKm: Math.round(radiusKm),
      stages,
      ratesFetched: shortlist.length,
      exclusions,
      enrichment: enriched.stats,
      providers: { places: places.name, routes: routes.name, rates: rates.name, enrichment: enrichment.enricherName },
      googleAttribution: results.some((r) => "google" in r.property.sourceRefs),
      durationMs: Date.now() - started,
    },
  };
}
