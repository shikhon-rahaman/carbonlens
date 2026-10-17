"""Public FastAPI routes for CarbonLens project verification."""

# ruff: noqa: E402

import asyncio
import hashlib
import json
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

import requests
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator
from shapely import from_wkt
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from web3 import Web3

VERIFIER_DIR = Path(__file__).resolve().parents[1] / "ai-verifier"
if str(VERIFIER_DIR) not in sys.path:
    sys.path.insert(0, str(VERIFIER_DIR))

import chain
import db
from config import Settings, get_settings
from explain import explain
from geo import (
    area_hectares,
    cells_to_bytes32,
    find_overlaps,
    parse_geojson,
    polygon_to_cells,
)
from ipfs import canonical_json, publish_evidence
from scoring import score_project
from security import (
    SecurityMiddleware,
    UnhandledErrorMiddleware,
    configure_logging,
    limiter,
)
from ndvi import get_cached_ndvi_series, get_ndvi_series

logger = configure_logging()


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", str_strip_whitespace=True)


class VerifyRequest(StrictModel):
    name: StrictStr = Field(min_length=1, max_length=64)
    claimed_hectares: float = Field(gt=0, le=50_000)
    geojson: dict[str, Any]
    turnstile_token: StrictStr = Field(min_length=1, max_length=4096)
    demo_scenario: Literal["healthy", "deforested"] | None = None

    @field_validator("name")
    @classmethod
    def name_fits_contract_byte_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 64:
            raise ValueError("Name must not exceed 64 UTF-8 bytes.")
        if any(character in value for character in "<>\x00") or any(
            ord(character) < 32 or 127 <= ord(character) <= 159
            for character in value
        ):
            raise ValueError("Name contains unsupported markup or control characters.")
        return value


class HealthResponse(StrictModel):
    ok: bool


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers={"X-Request-ID": request_id},
    )


async def verify_turnstile(token: str, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    if settings.env.lower() == "development" and settings.turnstile_dev_bypass:
        return True
    if settings.turnstile_secret is None:
        return False
    try:
        response = await run_in_threadpool(
            requests.post,
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": settings.turnstile_secret.get_secret_value(),
                "response": token,
            },
            timeout=5,
        )
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError):
        return False
    return isinstance(result, dict) and result.get("success") is True


def _polygon_hash(polygon: Any) -> str:
    normalized = polygon.normalize()
    return hashlib.sha256(normalized.wkb).hexdigest()


def _public_result(
    *,
    project_id: str,
    score: int,
    breakdown: dict[str, float],
    ndvi_series: list[dict[str, Any]],
    flags: list[str],
    evidence_hash: str,
    evidence_uri: str,
    explanation: str,
    status: str,
    tx_hash: str | None,
    data_source: str,
    confidence: str = "low",
) -> dict[str, Any]:
    return {
        "project_id": project_id,
        "score": score,
        "breakdown": breakdown,
        "ndvi_series": ndvi_series,
        "flags": flags,
        "evidence_hash": evidence_hash,
        "evidence_uri": evidence_uri,
        "explanation": explanation,
        "status": status,
        "tx_hash": tx_hash,
        "data_source": data_source,
        "confidence": confidence,
    }


def _duplicate_result(
    existing: db.Project | None,
    data_source: str,
) -> dict[str, Any]:
    if existing is None:
        return _public_result(
            project_id="",
            score=0,
            breakdown={"vegetation": 0, "stability": 0, "consistency": 0},
            ndvi_series=[],
            flags=["This region conflicts with an existing registry entry."],
            evidence_hash="",
            evidence_uri="",
            explanation="The submitted region conflicts with an existing project.",
            status="duplicate",
            tx_hash=None,
            data_source=data_source,
            confidence="low",
        )
    original = dict(existing.public_result)
    original["status"] = "duplicate"
    original["explanation"] = "The submitted region conflicts with an existing project."
    return original


def _check_database_overlap(
    polygon: Any,
    records: list[tuple[str, str]],
) -> list[str]:
    existing = [
        {"id": record_id, "polygon": from_wkt(polygon_wkt)}
        for record_id, polygon_wkt in records
    ]
    if not existing:
        return []
    return find_overlaps(
        polygon,
        existing,
        threshold=0.05,
        expand_neighbors=True,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    await run_in_threadpool(db.create_schema)
    app.state.verify_semaphore = asyncio.Semaphore(
        get_settings().max_concurrent_verifications
    )
    yield


app = FastAPI(
    title="CarbonLens API",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_middleware(UnhandledErrorMiddleware)
app.add_exception_handler(RateLimitExceeded, lambda request, exc: _error_response(
    request, 429, "rate_limit_exceeded", "Request rate limit exceeded."
))
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,
)
app.add_middleware(SecurityMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    logger.warning(
        json.dumps(
            {
                "event": "request_validation_failed",
                "request_id": getattr(request.state, "request_id", "unknown"),
                "errors": [
                    {"location": [str(part) for part in error.get("loc", ())], "type": error.get("type")}
                    for error in exc.errors()
                ],
            },
            separators=(",", ":"),
        )
    )
    return _error_response(request, 422, "validation_error", "Request validation failed.")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    codes = {
        404: ("not_found", "The requested resource was not found."),
        413: ("request_too_large", "Request body exceeds 256 KB."),
        422: ("validation_error", "Request validation failed."),
    }
    code, message = codes.get(exc.status_code, ("request_failed", "The request could not be completed."))
    return _error_response(request, exc.status_code, code, message)


@app.get("/health", response_model=HealthResponse)
@limiter.limit("60/minute")
async def health(request: Request) -> dict[str, bool]:
    return {"ok": True}


@app.get("/stats", response_model=None)
@limiter.limit("60/minute")
async def registry_stats(
    request: Request,
    database: Session = Depends(db.get_db),
) -> dict[str, int]:
    return await run_in_threadpool(db.get_registry_stats, database)


@app.post("/verify", response_model=None)
@limiter.limit("30/day")
@limiter.limit("5/minute")
async def verify(
    payload: VerifyRequest,
    request: Request,
    database: Session = Depends(db.get_db),
) -> dict[str, Any] | JSONResponse:
    settings = get_settings()
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in settings.cors_origins:
        return _error_response(
            request,
            403,
            "origin_not_allowed",
            "This origin is not permitted.",
        )
    if payload.demo_scenario is not None and not settings.cached_demo_mode:
        return _error_response(
            request,
            422,
            "demo_mode_disabled",
            "Cached demo scenarios are not enabled.",
        )
    if not await verify_turnstile(payload.turnstile_token, settings):
        return _error_response(
            request,
            403,
            "turnstile_failed",
            "Bot verification failed. Please try again.",
        )

    semaphore: asyncio.Semaphore = app.state.verify_semaphore
    async with semaphore:
        try:
            polygon = await run_in_threadpool(parse_geojson, payload.geojson)
        except (ValueError, TypeError):
            return _error_response(
                request,
                422,
                "invalid_geometry",
                "The submitted GeoJSON polygon is invalid.",
            )

        actual_hectares = await run_in_threadpool(area_hectares, polygon)
        polygon_hash = _polygon_hash(polygon)
        existing_exact = await run_in_threadpool(
            db.get_project_by_hash,
            database,
            polygon_hash,
        )
        if existing_exact is not None:
            await run_in_threadpool(db.record_blocked_duplicate, database)
            return dict(existing_exact.public_result)

        cells = await run_in_threadpool(polygon_to_cells, polygon, expand_neighbors=True)
        if not cells:
            return _error_response(
                request,
                422,
                "invalid_geometry",
                "The submitted polygon does not cover a supported registry cell.",
            )
        cell_hashes = cells_to_bytes32(cells)
        try:
            overlapping_ids = await run_in_threadpool(
                _check_database_overlap,
                polygon,
                db.get_polygon_records(database),
            )
            region_is_free = await run_in_threadpool(chain.check_region, cell_hashes, settings)
        except Exception:
            logger.error(
                json.dumps(
                    {
                        "event": "duplicate_check_failed",
                        "request_id": request.state.request_id,
                    },
                    separators=(",", ":"),
                )
            )
            return _error_response(
                request,
                503,
                "registry_unavailable",
                "The project registry is temporarily unavailable.",
            )
        if overlapping_ids or not region_is_free:
            await run_in_threadpool(db.record_blocked_duplicate, database)
            duplicate_id = overlapping_ids[0] if overlapping_ids else None
            existing = (
                await run_in_threadpool(db.get_project, database, duplicate_id)
                if duplicate_id is not None
                else None
            )
            return _duplicate_result(existing, "cached")

        try:
            if settings.cached_demo_mode:
                cache_key = (
                    "deforested"
                    if payload.demo_scenario == "deforested"
                    else "healthy_forest"
                )
                ndvi_series = await run_in_threadpool(
                    get_cached_ndvi_series,
                    cache_key,
                )
            else:
                ndvi_series = await run_in_threadpool(
                    get_ndvi_series,
                    polygon,
                    2023,
                    2025,
                )
            source = (
                "live"
                if ndvi_series and all(point.get("source") == "live" for point in ndvi_series)
                else "cached"
            )
            score_result = await run_in_threadpool(
                score_project,
                ndvi_series,
                payload.claimed_hectares,
                source,
            )
            explanation = await run_in_threadpool(
                explain,
                score_result,
                payload.name,
            )
        except Exception:
            logger.error(
                json.dumps(
                    {
                        "event": "verification_analysis_failed",
                        "request_id": request.state.request_id,
                    },
                    separators=(",", ":"),
                )
            )
            return _error_response(
                request,
                503,
                "verification_unavailable",
                "Satellite verification is temporarily unavailable.",
            )

        project_id = str(uuid4())
        safe_series = [
            {"date": str(point["date"]), "value": float(point["value"])}
            for point in ndvi_series
        ]
        breakdown = {
            "vegetation": float(score_result["vegetation"]),
            "stability": float(score_result["stability"]),
            "consistency": float(score_result["consistency"]),
        }
        evidence = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "data_source": source,
            "flags": list(score_result["flags"]),
            "ndvi_series": safe_series,
            "polygon_hash": polygon_hash,
            "project_id": project_id,
            "score": int(score_result["total"]),
            "scoring_version": "1",
            "claimed_hectares": float(payload.claimed_hectares),
            "measured_hectares": float(actual_hectares),
            "breakdown": breakdown,
        }
        evidence_bytes = canonical_json(evidence)
        evidence_hash = Web3.to_hex(Web3.keccak(evidence_bytes))
        try:
            published_hash, evidence_uri = await run_in_threadpool(
                publish_evidence,
                evidence,
                settings,
            )
            if Web3.to_bytes(hexstr=published_hash) != Web3.to_bytes(hexstr=evidence_hash):
                raise RuntimeError("Evidence publisher returned an inconsistent hash.")
        except Exception:
            logger.error(
                json.dumps(
                    {
                        "event": "evidence_publish_failed",
                        "request_id": request.state.request_id,
                    },
                    separators=(",", ":"),
                )
            )
            return _error_response(
                request,
                503,
                "evidence_unavailable",
                "Evidence storage is temporarily unavailable.",
            )

        status = "rejected"
        transaction_hash: str | None = None
        registration_reserved = False
        registration_submitted = False
        if score_result["total"] >= settings.score_threshold:
            registration_reserved = await run_in_threadpool(
                db.reserve_registration,
                database,
                settings.daily_registration_cap,
            )
            if not registration_reserved:
                return _error_response(
                    request,
                    429,
                    "registration_capacity_reached",
                    "Daily on-chain registration capacity reached. Please try again tomorrow.",
                )
            try:
                credits = min(
                    1_000_000,
                    max(1, round(payload.claimed_hectares * score_result["total"] / 100)),
                )
                transaction_hash = await run_in_threadpool(
                    chain.register_project,
                    name=payload.name,
                    cells=cell_hashes,
                    evidence_hash=evidence_hash,
                    evidence_uri=evidence_uri,
                    score=int(score_result["total"]),
                    credits=credits,
                    settings=settings,
                )
                registration_submitted = True
                status = "verified"
            except Exception:
                await run_in_threadpool(db.release_registration, database)
                logger.error(
                    json.dumps(
                        {
                            "event": "registration_failed",
                            "request_id": request.state.request_id,
                        },
                        separators=(",", ":"),
                    )
                )
                return _error_response(
                    request,
                    503,
                    "registration_unavailable",
                    "On-chain registration is temporarily unavailable.",
                )

        result = _public_result(
            project_id=project_id,
            score=int(score_result["total"]),
            breakdown=breakdown,
            ndvi_series=safe_series,
            flags=list(score_result["flags"]),
            evidence_hash=evidence_hash,
            evidence_uri=evidence_uri,
            explanation=explanation,
            status=status,
            tx_hash=transaction_hash,
            data_source=source,
            confidence=str(score_result["confidence"]),
        )
        values = {
            "id": project_id,
            "polygon_hash": polygon_hash,
            "polygon_wkt": polygon.wkt,
            "name": payload.name,
            "claimed_hectares": float(payload.claimed_hectares),
            "score": int(score_result["total"]),
            "breakdown": breakdown,
            "ndvi_series": safe_series,
            "flags": list(score_result["flags"]),
            "evidence_hash": evidence_hash,
            "evidence_uri": evidence_uri,
            "explanation": explanation,
            "status": status,
            "tx_hash": transaction_hash,
            "data_source": source,
            "created_at": datetime.now(timezone.utc),
            "public_result": result,
        }
        try:
            await run_in_threadpool(db.save_project, database, values)
        except Exception:
            if registration_reserved and not registration_submitted:
                await run_in_threadpool(db.release_registration, database)
            logger.error(
                json.dumps(
                    {
                        "event": "project_persist_failed",
                        "request_id": request.state.request_id,
                    },
                    separators=(",", ":"),
                )
            )
            return _error_response(
                request,
                503,
                "persistence_unavailable",
                "The verification result could not be saved.",
            )
        return result


@app.get("/projects")
@limiter.limit("60/minute")
async def projects(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1_000_000),
    database: Session = Depends(db.get_db),
) -> dict[str, Any]:
    records = await run_in_threadpool(db.list_projects, database, limit, offset)
    total = await run_in_threadpool(db.count_projects, database)
    return {
        "projects": [dict(record.public_result) for record in records],
        "limit": limit,
        "offset": offset,
        "total": total,
    }


@app.get("/projects/{project_id}", response_model=None)
@limiter.limit("60/minute")
async def project(
    project_id: str,
    request: Request,
    database: Session = Depends(db.get_db),
) -> dict[str, Any] | JSONResponse:
    record = await run_in_threadpool(db.get_project, database, project_id)
    if record is None:
        return _error_response(request, 404, "not_found", "The requested resource was not found.")
    return dict(record.public_result)
