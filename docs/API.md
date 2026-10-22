# CarbonLens API

This reference follows the public API contract in [SPEC.md](./SPEC.md). All
responses are JSON. The API validates and bounds request fields; clients
should use only documented response fields.

## Base URL

Local development defaults to `http://localhost:8000`. In deployment, use the
Render API origin configured as `NEXT_PUBLIC_API_BASE_URL`.

## `POST /verify`

Submits a project for verification. Requests require a valid Cloudflare
Turnstile token; the API verifies it server-side. Requests are rate-limited,
subject to a daily registration cap, and limited to a 256 KB body.

```json
{
  "name": "Forest sample",
  "claimed_hectares": 40,
  "geojson": {
    "type": "Feature",
    "properties": {},
    "geometry": {
      "type": "Polygon",
      "coordinates": []
    }
  },
  "turnstile_token": "challenge-token"
}
```

`demo_scenario` is optional and accepts `healthy` or `deforested` only when
cached demo mode is enabled:

```json
{
  "name": "Forest sample",
  "claimed_hectares": 40,
  "geojson": {},
  "turnstile_token": "challenge-token",
  "demo_scenario": "healthy"
}
```

Explicit sample scenarios use reviewed cached NDVI series and make no live
satellite-provider request. They are labeled `cached`; this mode does not
bypass Turnstile, rate limits, the daily registration cap, or ordinary
registration behavior.

Possible outcomes are `verified`, `rejected`, or `duplicate`. Eligible
verified claims may have a Sepolia transaction hash; rejected/duplicate
outcomes do not create a second registration.

Example response shape:

```json
{
  "project_id": "project-id",
  "score": 95,
  "breakdown": {
    "vegetation": 91.17,
    "stability": 97.0,
    "consistency": 100.0
  },
  "ndvi_series": [
    {"date": "2023-01-01", "value": 0.8}
  ],
  "flags": ["The NDVI observations are cached rather than live."],
  "evidence_hash": "0x...",
  "evidence_uri": "ipfs://...",
  "explanation": "Explanation text",
  "status": "verified",
  "tx_hash": "0x...",
  "data_source": "cached",
  "confidence": "low"
}
```

The example shows the shape; real values and optional transaction/evidence
fields vary with the result and deployment configuration. A score is an
indicator from the configured vegetation model, not proof of carbon storage.

## `GET /projects?limit&offset`

Returns paginated public project records and total count. `limit` and `offset`
are bounded non-negative integers.

## `GET /projects/{id}`

Returns the public record for one project identifier. Client-visible errors
do not disclose stack traces or internal service details.

## `GET /health`

Returns a minimal health response without configuration or secret values:

```json
{"ok": true}
```

## `GET /stats`

Returns public aggregate counters without project names or locations:

```json
{
  "verified_count": 0,
  "credits_minted": 0,
  "duplicates_blocked": 0
}
```

`credits_minted` sums the per-registration credit amounts for verified
projects. `duplicates_blocked` counts duplicate submissions intercepted by
the registry, including exact idempotent resubmissions. Counters are persisted
in the API database.

## Errors

Errors use a generic shape and avoid returning internal details:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed."
  }
}
```

Relevant outcomes include validation failures, oversized request bodies,
Turnstile failures, rate limits, daily-cap exhaustion, and service errors.
Clients should handle status codes rather than depending on internal messages.

## Security and interpretation

The API uses explicit allowed origins, schema validation, request-size bounds,
Turnstile verification, rate limits, and a database-backed daily registration
cap. The verifier is a trusted attestor; on-chain geohash checks and off-chain
polygon overlap checks can be evaded by shifting beyond their thresholds.
Cached sample NDVI and live-provider observations have different provenance
and confidence. See [THREAT_MODEL.md](./THREAT_MODEL.md) and
[SECURITY_REPORT.md](./SECURITY_REPORT.md).
