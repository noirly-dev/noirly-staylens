"use client";

import { AdvancedMarker, APIProvider, ColorScheme, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import type { ScoredProperty } from "@/lib/scoring/score";
import type { GeoPoint } from "@/lib/types";
import { markerLabel } from "./markerLabel";

interface Props {
  apiKey: string;
  mapId?: string;
  theme: "dark" | "light";
  origin: GeoPoint;
  results: ScoredProperty[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function GoogleResultsMap({ apiKey, mapId, theme, ...rest }: Props) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId={mapId || "DEMO_MAP_ID"}
        defaultCenter={rest.origin}
        defaultZoom={8}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        colorScheme={theme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT}
        className="h-full w-full"
      >
        <Markers {...rest} />
      </Map>
    </APIProvider>
  );
}

function Markers({ origin, results, selectedId, hoveredId, onSelect, onHover }: Omit<Props, "apiKey" | "mapId" | "theme">) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (!results.length) {
      map.panTo(origin);
      return;
    }
    const bounds = new google.maps.LatLngBounds(origin);
    for (const r of results) bounds.extend({ lat: r.property.lat, lng: r.property.lng });
    map.fitBounds(bounds, 48);
  }, [map, origin, results]);

  useEffect(() => {
    const r = results.find((x) => x.property.id === selectedId);
    if (map && r) map.panTo({ lat: r.property.lat, lng: r.property.lng });
  }, [map, selectedId, results]);

  return (
    <>
      <AdvancedMarker position={origin} title={origin.label ?? "Start"} zIndex={1}>
        <div className="h-4 w-4 rounded-full border-2 border-white bg-teal shadow" />
      </AdvancedMarker>
      {results.map((r, i) => {
        const active = r.property.id === selectedId || r.property.id === hoveredId;
        return (
          <AdvancedMarker
            key={r.property.id}
            position={{ lat: r.property.lat, lng: r.property.lng }}
            title={r.property.name}
            zIndex={active ? 1000 : results.length - i}
            onClick={() => onSelect(r.property.id)}
            onMouseEnter={() => onHover(r.property.id)}
            onMouseLeave={() => onHover(null)}
          >
            <div
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-md transition ${
                active ? "scale-110 border-white bg-accent text-accent-contrast" : "border-black/20 bg-white text-neutral-900"
              }`}
            >
              {markerLabel(r)}
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}
