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

## Getting the keys

Every key is optional. Add only what you need to `.env.local`, which is git-ignored, then restart `pnpm dev`. For a production build, run `pnpm build` again, because Next.js bakes `NEXT_PUBLIC_*` values in at build time.

### Google Maps Platform: `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID`

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create or select a project and turn on billing. Google Maps Platform needs a billing account, but it gives you a monthly free usage credit.
2. Under **APIs & Services → Library**, enable:
   - **Places API (New)**: finds stays, fetches details and photos, and geocodes the "From" box
   - **Routes API**: drive times, via Route Matrix
   - **Maps JavaScript API**: the map in the browser
3. Under **APIs & Services → Credentials → Create credentials → API key**, create **two** keys:
   - **Server key** → `GOOGLE_MAPS_API_KEY`. Under API restrictions, allow only *Places API (New)* and *Routes API*. In production you can also restrict it to your server's IP addresses.
   - **Browser key** → `NEXT_PUBLIC_GOOGLE_MAPS_KEY`. Under application restrictions, choose *Websites* and add `http://localhost:3000/*` and your domain. Under API restrictions, allow only *Maps JavaScript API*.

   Never put the server key in a `NEXT_PUBLIC_*` variable: those are sent to the browser.
4. Optional: `NEXT_PUBLIC_GOOGLE_MAP_ID`. Go to **Google Maps Platform → Map management → Create Map ID**, pick *JavaScript*, and paste the ID in. If you leave it empty, the app uses Google's `DEMO_MAP_ID`, which is fine for development.

With only the server key set, the search uses real Google data. However, Google's terms require Places results to be shown on a Google map, so also set the browser key.

### SerpApi (live prices): `SERPAPI_KEY`, `RATES_PROVIDER=serpapi`

1. Sign up at [serpapi.com](https://serpapi.com/).
2. Copy your key from the dashboard's **API Key** page ([serpapi.com/manage-api-key](https://serpapi.com/manage-api-key)) into `SERPAPI_KEY`.
3. Set `RATES_PROVIDER=serpapi`. If you leave it as `mock`, you get made-up but deterministic prices.

Each uncached search uses up to 25 SerpApi searches, one per shortlisted stay, so check your plan's monthly limit. Results are cached for 30 minutes per stay, dates and number of guests.

### MongoDB: `MONGODB_URI`, `MONGODB_DB`

**Option A: MongoDB Atlas (hosted, free tier)**

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com/).
2. Under **Database Access**, add a database user with a password.
3. Under **Network Access**, add your IP address (or your host's outbound IPs).
4. Click **Connect → Drivers** on the cluster and copy the connection string, e.g. `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`. URL-encode any special characters in the password.

**Option B: local, with Docker**

```bash
docker run -d --name staylens-mongo -p 27017:27017 mongo:7
# MONGODB_URI=mongodb://localhost:27017
```

`MONGODB_DB` defaults to `staylens`. The database, collections and indexes are created automatically on first connect.

### Upstash Redis (shared cache): `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`

1. Create a Redis database at [console.upstash.com](https://console.upstash.com/).
2. In the database's **REST API** section, copy:
   - `UPSTASH_REDIS_REST_URL` → `UPSTASH_REDIS_URL`
   - `UPSTASH_REDIS_REST_TOKEN` → `UPSTASH_REDIS_TOKEN`

   Note that the names differ slightly from what Upstash shows.

Without it, each server process uses its own in-memory cache. That's fine for a single `pnpm dev` or `pnpm start`, but on serverless hosting each instance has a separate cache.

### Example `.env.local`

```bash
RATES_PROVIDER=serpapi
GOOGLE_MAPS_API_KEY=AIza...server
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...browser
NEXT_PUBLIC_GOOGLE_MAP_ID=
SERPAPI_KEY=...
MONGODB_URI=mongodb+srv://staylens:...@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=staylens
UPSTASH_REDIS_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_TOKEN=...
```

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
