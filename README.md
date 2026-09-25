# Staylens

Requirements-first resort & stay search. Describe what you want (budget, drive time, amenities, vibe), and get a ranked list and map of matching stays with live prices. Destination is the output, not the input.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # all keys optional
pnpm dev                      # http://localhost:3000
```

No AI model is used anywhere: vibe tags come from keyword/synonym matching over descriptions and reviews, and the natural-language box is a rule-based parser — both driven by `config/filters.json`.

If no keys are set, **everything runs offline**: mock places/routes/rates, in-memory stores and caches, and a schematic fallback map.

```bash
pnpm typecheck && pnpm lint && pnpm test   # CI gate
pnpm test:coverage                         # scoring engine coverage (threshold 90%)
```

## Environment

| Variable | Effect when set |
| --- | --- |
| `RATES_PROVIDER` | `mock` (default) or `serpapi` (requires `SERPAPI_KEY`) |
| `GOOGLE_MAPS_API_KEY` | Server-side Places API (New) + Routes API instead of mocks |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Google map in the browser (`NEXT_PUBLIC_GOOGLE_MAP_ID` optional, for Advanced Markers) |
| `SERPAPI_KEY` | SerpApi Google Hotels rates adapter |
| `MONGODB_URI` / `MONGODB_DB` | MongoDB for persistent enrichment tags and entity matches (db defaults to `staylens`) |
| `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` | Redis cache for rates (30 min) and places responses |

Database: no migrations needed. Collections are `enrichments` (`_id` = place ID) and `entity_matches` (GeoJSON `location` with a `2dsphere` index, created automatically on first connect).

## Architecture

```
config/filters.json          single source of truth for filters (Zod-validated)
lib/config/                  config schema, per-filter value schemas, defaults
lib/scoring/                 pure scoring engine: evaluate, hard filters, weighted score, ranking
lib/providers/               adapters -> normalized Property (lib/types.ts)
  google/places.ts, routes.ts    Places Text Search / Details, Route Matrix
  serpapi.ts                     Google Hotels rates + entity matching
  mock/                          deterministic offline world, routes, rates
  cached.ts                      Redis/memory caching wrappers
lib/matching/                name similarity + <300 m distance, confidence score
lib/enrichment/              tag vocabulary (from config), keyword enricher, tag store
lib/db/mongo.ts              MongoDB stores for tags + entity matches
lib/search/pipeline.ts       cost-ordered search pipeline
lib/nlp/                     NL query -> filter values (rule-based, config-driven)
app/api/                     /search, /parse-query, /config/filters, /geocode, /photo
components/                  config-generated filter panel, results, maps, detail drawer
```

### Search pipeline (cost-ordered)

1. **Candidates** — places near the origin; radius derived from the max drive time filter.
2. **Drive time** — Route Matrix, then hard filters with `source: "routes"`.
3. **Attributes / enrichment** — hard filters with `source: "places"`, then enrichment tags (loaded from cache; computed only if an enrichment filter is active), then hard filters with `source: "enrichment"`.
4. **Rates** — only for the top `search.maxRateFetches` (≤ 25, enforced by the schema) by preliminary score.
5. **Price** — hard filters with `source: "rates"`.
6. **Scoring** — weighted `matchScore` 0–100 with a per-filter breakdown.

### Filter config

Each filter has `id`, `label`, `type` (`range | bool | enum | llm_tag`), `source` (`rates | places | routes | enrichment`), either `hard: true` or a `weight` (0–1), plus `unit`, `default`, and type-specific fields:

- `range`: `field` (`nightlyRate | driveTimeMin | rating | reviewCount`), `min`, `max`, `step`, optional `tolerance` for soft partial credit.
- `bool` / `llm_tag`: `llm_tag` filters are derived tags matched against descriptions/reviews (the name is kept from the original spec; no model is involved). `key` (defaults to id), `synonyms` (provider amenity strings / review phrases), `matchOn` (`amenities | tags | types | name`).
- `enum`: `options[]` with their own synonyms.

**Adding a filter is a config change only.** For example, this makes a "Gym" toggle appear in the UI, affect scoring, be recognised by the query parser, and (if `source: "enrichment"`) join the derived-tag vocabulary:

```json
{ "id": "gym", "label": "Gym", "group": "Amenities", "type": "bool", "source": "places",
  "weight": 0.4, "synonyms": ["fitness center"], "default": false }
```

Scoring: hard filters exclude (missing data excludes unless `allowUnknown`). Active soft filters contribute `weight × score` normalised to 100; ranges score partially when just outside the bounds.

### Compliance notes

- Only Google `place_id`s are stored long-term (enrichment tags and entity matches are keyed by it); place searches are cached for 15 minutes and geocodes for 24 hours; place details are never cached.
- Google Places results are only shown on a Google map; the fallback map is used for mock data only. Photos are proxied through `/api/photo` with author attributions, and "Place data © Google" is shown.
- No booking, scraping, or accounts — outbound "View on provider" links only.
