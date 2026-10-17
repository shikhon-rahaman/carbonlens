"use client";

import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";

import type { GeoJSONFeature } from "@/lib/geojson";

function FitPolygon({ data }: { data: GeoJSONFeature }) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.geoJSON(data).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [data, map]);

  return null;
}

export function LeafletMap({
  geojson,
  className
}: {
  geojson: GeoJSONFeature;
  className?: string;
}) {
  const first = geojson.geometry.coordinates[0][0];
  const center: [number, number] = [first[1], first[0]];

  return (
    <div aria-label="Map showing the submitted project polygon" className={className} role="region">
      <MapContainer
        aria-label="Project polygon map"
        center={center}
        className="h-full min-h-[280px] w-full rounded-xl"
        scrollWheelZoom={false}
        zoom={12}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <GeoJSON
          data={geojson}
          eventHandlers={{}}
          style={{
            color: "#17633f",
            fillColor: "#58a67d",
            fillOpacity: 0.32,
            weight: 3
          }}
        />
        <FitPolygon data={geojson} />
      </MapContainer>
    </div>
  );
}
