import { z } from "zod";
import type { LatLng } from "@/lib/types";
import { chunk } from "@/lib/util/concurrency";
import { ProviderError, type RoutesProvider } from "../types";

const MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
/** 1 origin × 50 destinations per request keeps well inside Route Matrix element limits. */
const BATCH = 50;

const elementSchema = z.object({
  originIndex: z.number().optional(),
  destinationIndex: z.number().optional(),
  duration: z.string().optional(),
  condition: z.string().optional(),
  status: z.object({ code: z.number().optional() }).optional(),
});
const matrixResponseSchema = z.array(elementSchema);

const waypoint = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

export class GoogleRoutesProvider implements RoutesProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async driveTimes(origin: LatLng, destinations: readonly LatLng[]): Promise<(number | null)[]> {
    const out: (number | null)[] = new Array(destinations.length).fill(null);
    const batches = chunk(destinations, BATCH);
    await Promise.all(
      batches.map(async (batch, b) => {
        const res = await this.fetchImpl(MATRIX_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition,status",
          },
          body: JSON.stringify({
            origins: [waypoint(origin)],
            destinations: batch.map(waypoint),
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
          }),
        });
        if (!res.ok) throw new ProviderError(this.name, `route matrix failed: ${res.status} ${await res.text()}`, res.status);
        for (const el of matrixResponseSchema.parse(await res.json())) {
          const idx = (el.destinationIndex ?? 0) + b * BATCH;
          if (el.condition !== "ROUTE_EXISTS" || !el.duration || (el.status?.code ?? 0) !== 0) continue;
          const seconds = Number.parseFloat(el.duration.replace(/s$/, ""));
          if (Number.isFinite(seconds)) out[idx] = Math.round(seconds / 60);
        }
      }),
    );
    return out;
  }
}
