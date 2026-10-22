# CarbonLens API Contract

All responses are JSON. Inputs are validated and bounded by the API; callers must not rely on unspecified fields.

## `POST /verify`

Request:

```json
{
  "name": "string",
  "claimed_hectares": 0,
  "geojson": {},
  "turnstile_token": "string",
  "demo_scenario": "healthy"
}
```

`demo_scenario` is optional and accepts `healthy` or `deforested`. It is accepted
when `CACHED_DEMO_MODE=true`; the API then uses the corresponding reviewed
packaged NDVI series and makes no satellite provider requests. Without the flag,
callers must omit this field. Cached samples do not bypass Turnstile, rate limits,
the daily registration cap, or ordinary on-chain registration behavior.

Successful response:

```json
{
  "project_id": "string",
  "score": 0,
  "breakdown": {"vegetation": 0, "stability": 0, "consistency": 0},
  "ndvi_series": [{"date": "YYYY-MM-DD", "value": 0}],
  "flags": [],
  "evidence_hash": "string",
  "evidence_uri": "string",
  "explanation": "string",
  "status": "verified",
  "tx_hash": null,
  "data_source": "live",
  "confidence": "high"
}
```

`status` is one of `verified`, `rejected`, or `duplicate`. `tx_hash` is a string or `null`. `data_source` is `live` or `cached`. `confidence` is `high` or `low`.

## `GET /projects?limit&offset`

Returns a paginated list of public project records and the total record count. `limit` and `offset` are bounded non-negative integers.

## `GET /projects/{id}`

Returns one public project record by identifier.

## `GET /health`

```json
{"ok": true}
```

## `GET /stats`

Returns aggregate public counters without project names or locations:

```json
{"verified_count": 0, "credits_minted": 0, "duplicates_blocked": 0}
```

`credits_minted` sums the per-registration credit amounts for verified projects.
`duplicates_blocked` counts duplicate submissions intercepted by the registry, including
exact idempotent resubmissions. These counters are persisted by the API database.

## Errors

All client-visible errors use this shape and do not expose stack traces or internal details:

```json
{"error": {"code": "string", "message": "string"}}
```
