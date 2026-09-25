import { haversineKm } from "@/lib/geo";
import type { LatLng } from "@/lib/types";
import type { RoutesProvider } from "../types";

/** Straight-line distance × road factor at an assumed average speed. */
export class MockRoutesProvider implements RoutesProvider {
  readonly name = "mock";
  constructor(
    private readonly roadFactor = 1.3,
    private readonly avgSpeedKmh = 50,
  ) {}

  async driveTimes(origin: LatLng, destinations: readonly LatLng[]): Promise<(number | null)[]> {
    return destinations.map((d) => Math.round(((haversineKm(origin, d) * this.roadFactor) / this.avgSpeedKmh) * 60));
  }
}
