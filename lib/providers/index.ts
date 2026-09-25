import { createCache, type KvCache } from "@/lib/cache";
import { getFilterConfig } from "@/lib/config";
import { getDb, PgEnrichmentStore, PgEntityMatchSink } from "@/lib/db";
import { HeuristicEnricher } from "@/lib/enrichment/heuristic";
import { LlmEnricher } from "@/lib/enrichment/llm";
import { EnrichmentService } from "@/lib/enrichment/service";
import { MemoryEnrichmentStore, type EnrichmentStore } from "@/lib/enrichment/types";
import { getServerEnv } from "@/lib/env";
import { getAnthropic } from "@/lib/llm";
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
 * mock places/routes/rates, heuristic enrichment, in-memory caches.
 */
export function getServices(): AppServices {
  if (services) return services;
  const env = getServerEnv();
  const config = getFilterConfig();
  const cache = createCache(env);
  const db = env.DATABASE_URL ? getDb(env.DATABASE_URL) : undefined;

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
      matches: db ? new PgEntityMatchSink(db) : undefined,
    });
  } else {
    const mockPlaces = rawPlaces instanceof MockPlacesProvider ? rawPlaces : undefined;
    rawRates = new MockRatesProvider(config.currency, (id) => mockPlaces?.basePriceFor(id));
  }

  const store: EnrichmentStore = db ? new PgEnrichmentStore(db) : new MemoryEnrichmentStore();
  const heuristic = new HeuristicEnricher();
  const enrichment = env.ANTHROPIC_API_KEY
    ? new EnrichmentService(config, store, new LlmEnricher(getAnthropic(env.ANTHROPIC_API_KEY), env.ANTHROPIC_MODEL), heuristic)
    : new EnrichmentService(config, store, heuristic);

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
