"use client";

import { z } from "zod";

import { parseGeoJSONText, type GeoJSONFeature } from "@/lib/geojson";

const metadataSchema = z.object({
  name: z.string().max(64),
  claimed_hectares: z.number().positive().max(50_000),
  geojson: z.unknown()
});

const STORAGE_KEY = "carbonlens.project-metadata.v1";

export type LocalProjectMetadata = {
  name: string;
  claimed_hectares: number;
  geojson: GeoJSONFeature;
};

function readAll(): Record<string, LocalProjectMetadata> {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const valid: Record<string, LocalProjectMetadata> = {};
  for (const [projectId, value] of Object.entries(parsed)) {
    const result = metadataSchema.safeParse(value);
    if (!result.success) continue;
    try {
      const geojson = parseGeoJSONText(JSON.stringify(result.data.geojson));
      valid[projectId] = {
        name: result.data.name,
        claimed_hectares: result.data.claimed_hectares,
        geojson
      };
    } catch {
      continue;
    }
  }
  return valid;
}

export function saveProjectMetadata(
  projectId: string,
  metadata: LocalProjectMetadata
): void {
  const existing = readAll();
  const next = { ...existing, [projectId]: metadata };
  const entries = Object.entries(next).slice(-100);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function getProjectMetadata(projectId: string): LocalProjectMetadata | undefined {
  return readAll()[projectId];
}
