"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { GeoJSONFeature } from "@/lib/geojson";

const LeafletMap = dynamic(
  () => import("@/components/leaflet-map").then((module) => module.LeafletMap),
  {
    ssr: false,
    loading: () => <Skeleton aria-label="Loading project map" className="h-[320px] w-full" />
  }
);

export function ProjectMap({ geojson, className }: { geojson: GeoJSONFeature; className?: string }) {
  return <LeafletMap className={className} geojson={geojson} />;
}
