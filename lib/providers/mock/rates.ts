import type { Property, RateQuote } from "@/lib/types";
import { seededRandom } from "@/lib/util/hash";
import type { RatesProvider } from "../types";

/**
 * Deterministic prices keyed by place + dates + guests. Weekend nights cost more, ~8% of
 * properties have no availability (exercises "unknown" price handling).
 */
export class MockRatesProvider implements RatesProvider {
  readonly name = "mock";
  calls = 0;

  constructor(
    private readonly currency = "INR",
    private readonly basePriceFor?: (placeId: string) => number | undefined,
  ) {}

  async getRates(property: Property, checkIn: string, checkOut: string, guests: number): Promise<RateQuote | null> {
    this.calls++;
    const rand = seededRandom(`${property.placeId}:${checkIn}:${checkOut}:${guests}`);
    const stable = seededRandom(property.placeId);
    if (stable() < 0.08) return null;

    const base = this.basePriceFor?.(property.placeId) ?? 2000 + stable() * 9000;
    const quality = 0.7 + ((property.rating ?? 4) - 3.4) * 0.4;
    const day = new Date(`${checkIn}T00:00:00Z`).getUTCDay();
    const weekend = day === 5 || day === 6 ? 1.25 : 1;
    const guestFactor = 1 + Math.max(0, guests - 2) * 0.2;
    const jitter = 0.85 + rand() * 0.3;
    const nightly = Math.round((base * quality * weekend * guestFactor * jitter) / 50) * 50;

    return {
      nightlyRate: nightly,
      currency: this.currency,
      url: property.bookingUrl,
      providerPropertyId: property.placeId,
      confidence: 1,
    };
  }
}
