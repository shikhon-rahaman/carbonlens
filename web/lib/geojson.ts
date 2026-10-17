import { z } from "zod";

const positionSchema = z
  .tuple([z.number().finite(), z.number().finite()])
  .rest(z.number().finite());

const linearRingSchema = z.array(positionSchema).min(4).max(10_000).superRefine((ring, ctx) => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ctx.addIssue({
      code: "custom",
      message: "Each polygon ring must be closed."
    });
  }
  ring.forEach(([longitude, latitude], index) => {
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      ctx.addIssue({
        code: "custom",
        message: `Coordinate ${index + 1} is outside longitude/latitude bounds.`
      });
    }
  });
});

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(linearRingSchema).min(1).max(100)
});

const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: polygonSchema,
  properties: z.record(z.string(), z.unknown()).nullable().optional()
});

export type GeoJSONFeature = z.infer<typeof featureSchema>;

export class GeoJSONInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoJSONInputError";
  }
}

export function parseGeoJSONText(raw: string): GeoJSONFeature {
  if (new TextEncoder().encode(raw).length > 256 * 1024) {
    throw new GeoJSONInputError("GeoJSON must be 256 KB or smaller.");
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new GeoJSONInputError("Enter valid JSON for a Polygon or Polygon Feature.");
  }

  if (typeof input !== "object" || input === null || !("type" in input)) {
    throw new GeoJSONInputError("Enter a GeoJSON Polygon or Polygon Feature.");
  }

  const feature =
    input.type === "Feature"
      ? featureSchema.safeParse(input)
      : input.type === "Polygon"
        ? featureSchema.safeParse({ type: "Feature", geometry: input })
        : null;

  if (!feature || !feature.success) {
    const issue = feature && !feature.success ? feature.error.issues[0] : undefined;
    throw new GeoJSONInputError(issue?.message ?? "Only GeoJSON Polygon geometries are supported.");
  }

  return feature.data;
}
