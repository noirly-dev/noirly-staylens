import type { LatLng } from "./types";

const EARTH_RADIUS_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point `distanceKm` away from `origin` along `bearingDeg`. */
export function destinationPoint(origin: LatLng, distanceKm: number, bearingDeg: number): LatLng {
  const d = distanceKm / EARTH_RADIUS_KM;
  const b = rad(bearingDeg);
  const lat1 = rad(origin.lat);
  const lng1 = rad(origin.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

export function boundingBox(origin: LatLng, radiusKm: number): { low: LatLng; high: LatLng } {
  const dLat = deg(radiusKm / EARTH_RADIUS_KM);
  const dLng = deg(radiusKm / (EARTH_RADIUS_KM * Math.cos(rad(origin.lat))));
  return {
    low: { lat: Math.max(-90, origin.lat - dLat), lng: Math.max(-180, origin.lng - dLng) },
    high: { lat: Math.min(90, origin.lat + dLat), lng: Math.min(180, origin.lng + dLng) },
  };
}
