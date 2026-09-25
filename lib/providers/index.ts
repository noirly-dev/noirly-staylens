import { createCache, type KvCache } from "@/lib/cache";
import { getFilterConfig } from "@/lib/config";
import { createMongoStores } from "@/lib/db/mongo";
import { HeuristicEnricher } from "@/lib/enrichment/heuristic";
import { EnrichmentService } from "@/lib/enrichment/service";
import { MemoryEnrichmentStore, type EnrichmentStore } from "@/lib/enrichment/types";
import { getServerEnv } from "@/lib/env";
import type { SearchDeps } from "@/lib/search/pipeline";
import { CachedPlacesProvider, CachedRatesProvider } from "./cached";
import { GooglePlacesProvider } from "./google/places";
import { GoogleRoutesProvider } from "./google/routes";
import { MockPlacesProvider } from "./mock/places";
import { MockRatesProvider } from "./mock/rates";
import { MockRoutesProvider } from "./mock/routes";
import { SerpApiRatesProvider } from "./serpapi";
import type { PlacesProvider, RatesProvider, RoutesProvider } from "./types";

export interface AppServices extends SearchDeps {
  cache: KvCache;
}

let services: AppServices | undefined;

/**
 * Builds providers from env. With no keys at all everything runs offline:
 * mock places/routes/rates, keyword enrichment, in-memory stores and caches.
 */
export function getServices(): AppServices {
  if (services) return services;
  const env = getServerEnv();
  const config = getFilterConfig();
  const cache = createCache(env);
  const mongo = env.MONGODB_URI ? createMongoStores(env.MONGODB_URI, env.MONGODB_DB) : undefined;

  let rawPlaces: PlacesProvider;
  let routes: RoutesProvider;
  if (env.GOOGLE_MAPS_API_KEY) {
    rawPlaces = new GooglePlacesProvider(env.GOOGLE_MAPS_API_KEY);
    routes = new GoogleRoutesProvider(env.GOOGLE_MAPS_API_KEY);
  } else {
    rawPlaces = new MockPlacesProvider();
    routes = new MockRoutesProvider();
  }

  let rawRates: RatesProvider;
  if (env.RATES_PROVIDER === "serpapi") {
    rawRates = new SerpApiRatesProvider(env.SERPAPI_KEY!, {
      currency: config.currency,
      matches: mongo?.entityMatches,
    });
  } else {
    const mockPlaces = rawPlaces instanceof MockPlacesProvider ? rawPlaces : undefined;
    rawRates = new MockRatesProvider(config.currency, (id) => mockPlaces?.basePriceFor(id));
  }

  const store: EnrichmentStore = mongo?.enrichment ?? new MemoryEnrichmentStore();
  const enrichment = new EnrichmentService(config, store, new HeuristicEnricher());

  services = {
    config,
    cache,
    places: new CachedPlacesProvider(rawPlaces, cache),
    routes,
    rates: new CachedRatesProvider(rawRates, cache),
    enrichment,
  };
  return services;
}
