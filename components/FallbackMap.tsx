"use client";

import { haversineKm } from "@/lib/geo";
import type { ScoredProperty } from "@/lib/scoring/score";
import type { GeoPoint } from "@/lib/types";
import { markerLabel } from "./markerLabel";

interface Props {
  origin: GeoPoint;
  results: ScoredProperty[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * Offline schematic map used when no Google Maps key is configured (mock data only).
 * Equirectangular projection around the origin with distance rings.
 */
export function FallbackMap({ origin, results, selectedId, hoveredId, onSelect, onHover }: Props) {
  const maxKm = Math.max(20, ...results.map((r) => haversineKm(origin, r.property))) * 1.1;
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
  const project = (lat: number, lng: number) => ({
    x: 50 + (((lng - origin.lng) * kmPerDegLng) / maxKm) * 48,
    y: 50 - (((lat - origin.lat) * kmPerDegLat) / maxKm) * 48,
  });
  const ring = maxKm > 150 ? 50 : maxKm > 60 ? 25 : 10;
  const rings = Array.from({ length: Math.floor(maxKm / ring) }, (_, i) => (i + 1) * ring);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-surface-2 [container-type:size]">
      <div className="relative aspect-square w-[min(100cqw,100cqh)]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          {rings.map((km) => (
            <g key={km}>
              <circle cx={50} cy={50} r={(km / maxKm) * 48} fill="none" stroke="var(--border)" strokeWidth={0.25} strokeDasharray="0.8 0.8" />
              <text x={50 + (km / maxKm) * 48 * 0.707 + 0.5} y={50 - (km / maxKm) * 48 * 0.707} fontSize={2.2} fill="var(--muted)">
                {km} km
              </text>
            </g>
          ))}
        </svg>
        <div
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal shadow"
          style={{ left: "50%", top: "50%" }}
          title={origin.label ?? "Start"}
        />
        {results.map((r, i) => {
          const { x, y } = project(r.property.lat, r.property.lng);
          const active = r.property.id === selectedId || r.property.id === hoveredId;
          return (
            <button
              key={r.property.id}
              type="button"
              onClick={() => onSelect(r.property.id)}
              onMouseEnter={() => onHover(r.property.id)}
              onMouseLeave={() => onHover(null)}
              title={r.property.name}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shadow transition ${
                active ? "scale-110 border-white bg-accent text-accent-contrast" : "border-black/20 bg-white text-neutral-900"
              }`}
              style={{ left: `${x}%`, top: `${y}%`, zIndex: active ? 1000 : results.length - i }}
            >
              {markerLabel(r)}
            </button>
          );
        })}
      </div>
      <p className="absolute bottom-2 left-2 rounded bg-surface/80 px-2 py-1 text-[10px] text-muted">
        Offline preview map · set NEXT_PUBLIC_GOOGLE_MAPS_KEY for Google Maps
      </p>
    </div>
  );
}
