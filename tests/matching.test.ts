import { describe, expect, it } from "vitest";
import { diceCoefficient, findBestMatch, nameSimilarity, normalizeName } from "@/lib/matching";
import { destinationPoint } from "@/lib/geo";

const origin = { lat: 12.42, lng: 75.74 };

describe("entity matching", () => {
  it("normalizes names and drops generic words", () => {
    expect(normalizeName("The Tamarind Tree Resort & Spa")).toEqual(["tamarind", "tree"]);
  });

  it("computes name similarity", () => {
    expect(diceCoefficient("abc", "abc")).toBe(1);
    expect(diceCoefficient("a", "b")).toBe(0);
    expect(nameSimilarity("Tamarind Tree Resort", "The Tamarind Tree")).toBe(1);
    expect(nameSimilarity("Coorg Wilderness Resort", "Evolve Back Coorg")).toBeLessThan(0.6);
    expect(nameSimilarity("The Resort", "Resort")).toBe(1);
  });

  it("matches the closest similar candidate within 300 m", () => {
    const near = destinationPoint(origin, 0.05, 90);
    const far = destinationPoint(origin, 0.5, 90);
    const m = findBestMatch({ name: "Misty Hills Resort", ...origin }, [
      { name: "Misty Hills Resort", ...far },
      { name: "Misty Hills", ...near },
      { name: "Something Else", ...origin },
    ]);
    expect(m?.candidate.lat).toBeCloseTo(near.lat);
    expect(m?.distanceM).toBe(50);
    expect(m!.confidence).toBeGreaterThan(0.9);
  });

  it("returns null when nothing is close and similar enough", () => {
    const far = destinationPoint(origin, 0.31, 0);
    expect(findBestMatch({ name: "Misty Hills", ...origin }, [{ name: "Misty Hills", ...far }])).toBeNull();
    expect(findBestMatch({ name: "Misty Hills", ...origin }, [{ name: "Blue Lagoon", ...origin }])).toBeNull();
  });
});
