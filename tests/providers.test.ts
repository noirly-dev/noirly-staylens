import { describe, expect, it, vi } from "vitest";
import { MemoryCache, cached } from "@/lib/cache";
import { CachedPlacesProvider, CachedRatesProvider } from "@/lib/providers/cached";
import { GooglePlacesProvider, mapGooglePlace, resolvePhotoUri } from "@/lib/providers/google/places";
import { GoogleRoutesProvider } from "@/lib/providers/google/routes";
import { MockPlacesProvider, generateMockWorld } from "@/lib/providers/mock/places";
import { MockRatesProvider } from "@/lib/providers/mock/rates";
import { SerpApiRatesProvider, parseSerpCandidates } from "@/lib/providers/serpapi";
import { ProviderError, type RatesProvider } from "@/lib/providers/types";
import { makeProperty } from "./helpers";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("mock providers", () => {
  it("generates a deterministic world", () => {
    const a = generateMockWorld({ lat: 12.97, lng: 77.59 });
    const b = generateMockWorld({ lat: 12.97, lng: 77.59 });
    expect(a.map((p) => p.property.placeId)).toEqual(b.map((p) => p.property.placeId));
    expect(new Set(a.map((p) => p.property.name)).size).toBe(a.length);
  });

  it("searches, details and geocodes offline", async () => {
    const places = new MockPlacesProvider();
    const res = await places.searchLodging({ origin: { lat: 12.97, lng: 77.59 }, radiusKm: 100, query: "x", limit: 10 });
    expect(res.length).toBeLessThanOrEqual(10);
    expect((await places.getDetails(res[0]!.placeId))?.description).toContain(res[0]!.name);
    expect(await places.getDetails("nope")).toBeNull();
    expect(await places.geocode("Bangalore")).toMatchObject({ label: "Bengaluru, Karnataka" });
    expect(await places.geocode("12.5, 77.1")).toMatchObject({ lat: 12.5, lng: 77.1 });
    expect(await places.geocode("Atlantis")).toBeNull();
    expect(await places.geocode("  ")).toBeNull();
  });

  it("prices deterministically with weekend uplift", async () => {
    const rates = new MockRatesProvider();
    const p = makeProperty({ placeId: "stable-price" });
    const fri = await rates.getRates(p, "2026-10-09", "2026-10-10", 2);
    expect(await rates.getRates(p, "2026-10-09", "2026-10-10", 2)).toEqual(fri);
    expect(fri?.currency).toBe("INR");
  });
});

describe("GooglePlacesProvider", () => {
  const place = {
    id: "ChIJ1",
    displayName: { text: "Misty Hills Resort" },
    location: { latitude: 12.4, longitude: 75.7 },
    rating: 4.6,
    userRatingCount: 320,
    types: ["resort_hotel", "lodging"],
    googleMapsUri: "https://maps.google.com/?cid=1",
    allowsDogs: true,
    goodForChildren: true,
    photos: [{ name: "places/ChIJ1/photos/abc", authorAttributions: [{ displayName: "Asha", uri: "https://x" }] }],
  };

  it("maps into the normalized Property", () => {
    const p = mapGooglePlace(place);
    expect(p).toMatchObject({
      id: "ChIJ1",
      placeId: "ChIJ1",
      name: "Misty Hills Resort",
      amenities: ["allows_dogs", "good_for_children"],
      bookingUrl: "https://maps.google.com/?cid=1",
      sourceRefs: { google: { id: "ChIJ1" } },
    });
    expect(p.photos[0]).toEqual({ url: "/api/photo?name=places%2FChIJ1%2Fphotos%2Fabc", attribution: { name: "Asha", uri: "https://x" } });
    expect(mapGooglePlace({ id: "x", location: { latitude: 0, longitude: 0 } }).name).toBe("Unnamed stay");
  });

  it("paginates text search inside a rectangle and dedupes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ places: [place], nextPageToken: "t2" }))
      .mockResolvedValueOnce(json({ places: [place, { ...place, id: "ChIJ2" }] }));
    const g = new GooglePlacesProvider("key", fetchImpl);
    const res = await g.searchLodging({ origin: { lat: 12.9, lng: 77.6 }, radiusKm: 100, query: "resorts", limit: 60 });
    expect(res.map((p) => p.id)).toEqual(["ChIJ1", "ChIJ2"]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.headers["X-Goog-Api-Key"]).toBe("key");
    const body = JSON.parse(init.body);
    expect(body.includedType).toBe("lodging");
    expect(body.locationRestriction.rectangle.low.latitude).toBeLessThan(12.9);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body).pageToken).toBe("t2");
  });

  it("fetches details and geocodes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ id: "ChIJ1", editorialSummary: { text: "Calm." }, reviews: [{ text: { text: "Lovely" } }, {}] }))
      .mockResolvedValueOnce(json({ places: [{ ...place, formattedAddress: "Coorg" }] }))
      .mockResolvedValueOnce(json({}));
    const g = new GooglePlacesProvider("key", fetchImpl);
    expect(await g.getDetails("ChIJ1")).toEqual({ placeId: "ChIJ1", description: "Calm.", reviews: ["Lovely"] });
    expect(await g.geocode("Coorg")).toEqual({ lat: 12.4, lng: 75.7, label: "Coorg" });
    expect(await g.geocode("nowhere")).toBeNull();
  });

  it("throws ProviderError on HTTP errors", async () => {
    const g = new GooglePlacesProvider("key", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(g.getDetails("x")).rejects.toBeInstanceOf(ProviderError);
  });

  it("resolves photo URIs without leaking the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ photoUri: "https://lh3.googleusercontent.com/p" }));
    expect(await resolvePhotoUri("key", "places/a/photos/b", 800, fetchImpl)).toBe("https://lh3.googleusercontent.com/p");
    expect(await resolvePhotoUri("key", "../etc/passwd", 800, fetchImpl)).toBeNull();
  });
});

describe("GoogleRoutesProvider", () => {
  it("batches destinations and parses durations", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return json(
        body.destinations.map((_: unknown, i: number) =>
          i === 1 ? { originIndex: 0, destinationIndex: i, condition: "ROUTE_NOT_FOUND" } : { originIndex: 0, destinationIndex: i, duration: `${(i + 1) * 60}s`, condition: "ROUTE_EXISTS" },
        ),
      );
    });
    const r = new GoogleRoutesProvider("key", fetchImpl as unknown as typeof fetch);
    const dests = Array.from({ length: 55 }, (_, i) => ({ lat: 12 + i / 100, lng: 77 }));
    const times = await r.driveTimes({ lat: 12.9, lng: 77.6 }, dests);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(times[0]).toBe(1);
    expect(times[1]).toBeNull();
    expect(times[50]).toBe(1);
    expect(times[54]).toBe(5);
  });

  it("throws on HTTP errors", async () => {
    const r = new GoogleRoutesProvider("key", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
    await expect(r.driveTimes({ lat: 0, lng: 0 }, [{ lat: 1, lng: 1 }])).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("SerpApiRatesProvider", () => {
  const target = makeProperty({ placeId: "ChIJ1", name: "Misty Hills Resort", lat: 12.4, lng: 75.7, address: "Coorg" });
  const listing = (over: Record<string, unknown> = {}) => ({
    name: "Misty Hills Resort & Spa",
    property_token: "tok1",
    link: "https://mistyhills.example",
    gps_coordinates: { latitude: 12.4005, longitude: 75.7 },
    rate_per_night: { extracted_lowest: 7800, lowest: "₹7,800" },
    amenities: ["Outdoor pool"],
    ...over,
  });

  it("parses both list and single-property responses", () => {
    expect(parseSerpCandidates({ properties: [listing(), { bogus: 1 }] })).toHaveLength(1);
    expect(parseSerpCandidates(listing())).toHaveLength(1);
    expect(parseSerpCandidates({})).toEqual([]);
  });

  it("matches the listing and returns a quote with confidence", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(json({ properties: [listing({ name: "Other Place" }), listing()] }));
    const s = new SerpApiRatesProvider("k", { currency: "INR", fetchImpl, matches: { record } });
    const q = await s.getRates(target, "2026-10-09", "2026-10-11", 2);
    expect(q).toMatchObject({ nightlyRate: 7800, currency: "INR", providerPropertyId: "tok1", url: "https://mistyhills.example", amenities: ["Outdoor pool"] });
    expect(q!.confidence).toBeGreaterThan(0.8);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ placeId: "ChIJ1", provider: "serpapi", providerPropertyId: "tok1" }));
    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.searchParams.get("engine")).toBe("google_hotels");
    expect(url.searchParams.get("adults")).toBe("2");
  });

  it("returns null for far-away listings or no results, throws on API errors", async () => {
    const far = new SerpApiRatesProvider("k", {
      currency: "INR",
      fetchImpl: vi.fn().mockResolvedValue(json({ properties: [listing({ gps_coordinates: { latitude: 12.5, longitude: 75.7 } })] })),
    });
    expect(await far.getRates(target, "2026-10-09", "2026-10-11", 2)).toBeNull();
    const none = new SerpApiRatesProvider("k", { currency: "INR", fetchImpl: vi.fn().mockResolvedValue(json({ error: "Google Hotels hasn't returned any results for this query." })) });
    expect(await none.getRates(target, "2026-10-09", "2026-10-11", 2)).toBeNull();
    const bad = new SerpApiRatesProvider("k", { currency: "INR", fetchImpl: vi.fn().mockResolvedValue(json({ error: "Invalid API key" })) });
    await expect(bad.getRates(target, "2026-10-09", "2026-10-11", 2)).rejects.toThrow(/Invalid API key/);
    const http = new SerpApiRatesProvider("k", { currency: "INR", fetchImpl: vi.fn().mockResolvedValue(new Response("", { status: 429 })) });
    await expect(http.getRates(target, "2026-10-09", "2026-10-11", 2)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("caching", () => {
  it("MemoryCache expires entries", async () => {
    const c = new MemoryCache(2);
    await c.set("a", 1, 60);
    await c.set("b", 2, -1);
    expect(await c.get("a")).toBe(1);
    expect(await c.get("b")).toBeUndefined();
    await c.set("c", 3, 60);
    await c.set("d", 4, 60);
    expect(await c.get("a")).toBeUndefined();
    const load = vi.fn().mockResolvedValue(5);
    expect(await cached(c, "e", 60, load)).toBe(5);
    expect(await cached(c, "e", 60, load)).toBe(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("caches rates (including misses) by place + dates + guests", async () => {
    const inner: RatesProvider = { name: "x", getRates: vi.fn().mockResolvedValue(null) };
    const r = new CachedRatesProvider(inner, new MemoryCache());
    const p = makeProperty();
    await r.getRates(p, "2026-01-01", "2026-01-02", 2);
    await r.getRates(p, "2026-01-01", "2026-01-02", 2);
    await r.getRates(p, "2026-01-01", "2026-01-02", 3);
    expect(inner.getRates).toHaveBeenCalledTimes(2);
  });

  it("caches places searches and geocodes but not details", async () => {
    const inner = new MockPlacesProvider();
    const spy = vi.spyOn(inner, "searchLodging");
    const details = vi.spyOn(inner, "getDetails");
    const c = new CachedPlacesProvider(inner, new MemoryCache());
    const params = { origin: { lat: 12.97, lng: 77.59 }, radiusKm: 50, query: "q", limit: 5 };
    await c.searchLodging(params);
    await c.searchLodging(params);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await c.geocode("Pune")).toMatchObject({ label: "Pune, Maharashtra" });
    await c.getDetails("x");
    await c.getDetails("x");
    expect(details).toHaveBeenCalledTimes(2);
  });
});
