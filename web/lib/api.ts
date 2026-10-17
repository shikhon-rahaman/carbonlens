import { z } from "zod";

const ndviPointSchema = z.object({
  date: z.string().date(),
  value: z.number().min(-1).max(1)
});

const breakdownSchema = z.object({
  vegetation: z.number().min(0).max(100),
  stability: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100)
});

export const projectResultSchema = z.object({
  project_id: z.string().min(1),
  score: z.number().int().min(0).max(100),
  breakdown: breakdownSchema,
  ndvi_series: z.array(ndviPointSchema),
  flags: z.array(z.string().max(500)),
  evidence_hash: z.string().max(256),
  evidence_uri: z.string().max(512),
  explanation: z.string().max(400),
  status: z.enum(["verified", "rejected", "duplicate"]),
  tx_hash: z.string().max(256).nullable(),
  data_source: z.enum(["live", "cached"]),
  confidence: z.enum(["high", "low"]).default("low")
});

export const registryStatsSchema = z.object({
  verified_count: z.number().int().nonnegative(),
  credits_minted: z.number().int().nonnegative(),
  duplicates_blocked: z.number().int().nonnegative()
});

export const projectListSchema = z.object({
  projects: z.array(projectResultSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

const healthSchema = z.object({ ok: z.literal(true) });
const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().max(100),
    message: z.string().max(500)
  })
});

export type NdviPoint = z.infer<typeof ndviPointSchema>;
export type ProjectResult = z.infer<typeof projectResultSchema>;
export type ProjectList = z.infer<typeof projectListSchema>;
export type RegistryStats = z.infer<typeof registryStatsSchema>;
export type VerifyRequest = {
  name: string;
  claimed_hectares: number;
  geojson: import("@/lib/geojson").GeoJSONFeature;
  turnstile_token: string;
  demo_scenario?: "healthy" | "deforested";
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const API_TIMEOUT_MS = 10_000;
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(API_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers
      },
      cache: "no-store"
    });
  } catch (error: unknown) {
    if (init?.signal?.aborted) {
      throw new ApiError("Verification was canceled.", "aborted", 0);
    }
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError(
      timeout
        ? "The service took too long to respond. Please try again."
        : "The service is temporarily unavailable. Please try again.",
      timeout ? "timeout" : "network_error",
      0
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The service returned an unreadable response.", "invalid_response", response.status);
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiError(
        parsedError.data.error.message,
        parsedError.data.error.code,
        response.status
      );
    }
    throw new ApiError(
      "The request could not be completed. Please try again.",
      "request_failed",
      response.status
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      "The service returned data in an unexpected format.",
      "invalid_response",
      response.status
    );
  }
  return parsed.data;
}

export const api = {
  health: () => requestJson("/health", healthSchema),
  stats: () => requestJson("/stats", registryStatsSchema),
  verify: (payload: VerifyRequest, signal?: AbortSignal) =>
    requestJson("/verify", projectResultSchema, {
      method: "POST",
      body: JSON.stringify(payload),
      signal
    }),
  projects: (limit = 20, offset = 0) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });
    return requestJson(`/projects?${params}`, projectListSchema);
  },
  project: (projectId: string) =>
    requestJson(`/projects/${encodeURIComponent(projectId)}`, projectResultSchema)
};
