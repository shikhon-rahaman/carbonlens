import asyncio
import copy
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

os.environ["ENV"] = "development"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import requests
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from web3 import Web3

import db
import main
from config import Settings
from ipfs import canonical_json
from security import JsonLogFormatter, limiter

_verify_turnstile = main.verify_turnstile
ROOT = Path(__file__).resolve().parents[2]
HEALTHY_POLYGON = json.loads(
    (ROOT / "data" / "forest_healthy.geojson").read_text(encoding="utf-8")
)
OVERLAPPING_POLYGON = json.loads(
    (ROOT / "data" / "forest_overlap.geojson").read_text(encoding="utf-8")
)
SERIES = [
    {"date": f"2023-{quarter:02d}-01", "value": 0.82, "source": "live"}
    for quarter in (1, 4, 7, 10)
] + [
    {"date": f"2024-{quarter:02d}-01", "value": 0.83, "source": "live"}
    for quarter in (1, 4, 7, 10)
] + [
    {"date": f"2025-{quarter:02d}-01", "value": 0.84, "source": "live"}
    for quarter in (1, 4, 7, 10)
]
CHALLENGE_OK = "challenge-accepted"
CHALLENGE_DENIED = "challenge-denied"


@pytest.fixture
def client(monkeypatch):
    db.Base.metadata.drop_all(db.engine)
    db.create_schema()
    limiter.reset()
    monkeypatch.setattr(main, "verify_turnstile", _turnstile_passes)
    monkeypatch.setattr(main.chain, "check_region", lambda cells, settings: True)
    monkeypatch.setattr(
        main.chain,
        "register_project",
        lambda **kwargs: "0x" + "1" * 64,
    )
    monkeypatch.setattr(main, "get_ndvi_series", lambda polygon, start, end: copy.deepcopy(SERIES))
    monkeypatch.setattr(
        main,
        "score_project",
        lambda series, hectares, source: {
            "vegetation": 90.0,
            "stability": 95.0,
            "consistency": 100.0,
            "total": 95,
            "flags": [],
            "flag_codes": [],
            "confidence": "high",
            "seasonal_note": "Compare same-quarter observations.",
        },
    )
    monkeypatch.setattr(main, "explain", lambda result, name: "Scores are strong.")

    def fake_publish(evidence, settings):
        return Web3.to_hex(Web3.keccak(canonical_json(evidence))), "ipfs://bafy-test"

    monkeypatch.setattr(main, "publish_evidence", fake_publish)
    with TestClient(main.app) as test_client:
        yield test_client
    db.Base.metadata.drop_all(db.engine)


async def _turnstile_passes(token, settings):
    return token != CHALLENGE_DENIED


def _request(polygon=HEALTHY_POLYGON, token=CHALLENGE_OK):
    return {
        "name": "Forest A",
        "claimed_hectares": 40.0,
        "geojson": copy.deepcopy(polygon),
        "turnstile_token": token,
    }


def test_health_projects_and_project_detail(client):
    assert client.get("/health").json() == {"ok": True}
    assert client.get("/stats").json() == {
        "verified_count": 0,
        "credits_minted": 0,
        "duplicates_blocked": 0,
    }
    result = client.post("/verify", json=_request()).json()
    assert result["status"] == "verified"
    assert result["confidence"] == "high"
    assert result["tx_hash"] == "0x" + "1" * 64
    assert client.get(f"/projects/{result['project_id']}").json() == result
    project_list = client.get("/projects?limit=10&offset=0").json()
    assert project_list["projects"] == [result]
    assert project_list["total"] == 1
    assert client.get("/stats").json() == {
        "verified_count": 1,
        "credits_minted": 38,
        "duplicates_blocked": 0,
    }
    assert client.get("/projects/not-a-project").status_code == 404


def test_strict_validation_rejects_unknown_fields_invalid_ranges_and_bad_geometry(client):
    assert client.post("/verify", json={**_request(), "extra": "no"}).status_code == 422
    assert (
        client.post(
            "/verify",
            json={**_request(), "claimed_hectares": 50_001},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/verify",
            json={**_request(), "name": "🍃" * 17},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/verify",
            json={**_request(), "geojson": {"type": "MultiPolygon", "coordinates": []}},
        ).status_code
        == 422
    )
    assert client.get("/projects?limit=101").status_code == 422


def test_demo_scenario_requires_cached_demo_mode(client):
    response = client.post(
        "/verify",
        json={**_request(), "demo_scenario": "deforested"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "demo_mode_disabled"


def test_cached_demo_mode_uses_packaged_data_without_live_satellite_calls(
    client,
    monkeypatch,
):
    from config import Settings
    from scoring import score_project as deterministic_score_project

    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: Settings(cached_demo_mode=True, turnstile_dev_bypass=True),
    )
    monkeypatch.setattr(
        main,
        "get_ndvi_series",
        lambda *args, **kwargs: pytest.fail("Cached demo mode called the satellite provider."),
    )
    monkeypatch.setattr(main, "score_project", deterministic_score_project)
    registered = []
    monkeypatch.setattr(
        main.chain,
        "register_project",
        lambda **kwargs: registered.append(kwargs),
    )

    response = client.post(
        "/verify",
        json={**_request(), "demo_scenario": "deforested"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["data_source"] == "cached"
    assert response.json()["confidence"] == "low"
    assert response.json()["tx_hash"] is None
    assert registered == []


def test_body_over_256_kb_is_rejected_with_standard_error(client):
    response = client.post(
        "/verify",
        content=b" " * (256 * 1024 + 1),
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"]


def test_verify_rate_limit_is_enforced(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "verify_turnstile",
        _async_false,
    )
    body = _request(token=CHALLENGE_DENIED)

    responses = [client.post("/verify", json=body) for _ in range(6)]

    assert [response.status_code for response in responses[:5]] == [403] * 5
    assert responses[5].status_code == 429
    assert responses[5].json() == {
        "error": {
            "code": "rate_limit_exceeded",
            "message": "Request rate limit exceeded.",
        }
    }


def test_read_rate_limit_is_enforced(client):
    limiter.reset()

    responses = [client.get("/health") for _ in range(61)]

    assert all(response.status_code == 200 for response in responses[:60])
    assert responses[60].status_code == 429
    assert responses[60].json()["error"]["code"] == "rate_limit_exceeded"


async def _async_false(*args):
    return False


def test_cors_is_allow_list_only(client):
    allowed = client.options(
        "/verify",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    denied = client.options(
        "/verify",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in denied.headers
    assert "GET" in allowed.headers["access-control-allow-methods"]
    assert "POST" in allowed.headers["access-control-allow-methods"]
    assert "DELETE" not in allowed.headers["access-control-allow-methods"]


def test_turnstile_fails_closed_when_provider_rejects(client, monkeypatch):
    monkeypatch.setattr(main, "verify_turnstile", _async_false)

    response = client.post("/verify", json=_request(token=CHALLENGE_DENIED))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "turnstile_failed"


def test_turnstile_timeout_fails_closed(client, monkeypatch):
    monkeypatch.setattr(main, "verify_turnstile", _verify_turnstile)
    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: Settings(turnstile_secret=SecretStr("turnstile-secret")),
    )
    with patch("main.requests.post", side_effect=requests.Timeout):
        response = client.post("/verify", json=_request(token="challenge-timeout"))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "turnstile_failed"


def test_production_settings_fail_fast_and_reject_cors_wildcards():
    with pytest.raises(ValidationError, match="Missing required production settings"):
        Settings(env="production")
    with pytest.raises(ValidationError, match="wildcard"):
        Settings(allowed_origins="https://example.com,*")
    with pytest.raises(ValidationError, match="only in development"):
        Settings(env="test", turnstile_dev_bypass=True)
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(
            env="production",
            allowed_origins="https://carbonlens.example",
            rpc_url=SecretStr("https://rpc.example"),
            chain_id=11155111,
            contract_address="0x" + "1" * 40,
            verifier_private_key=SecretStr("verifier-test"),
            turnstile_secret=SecretStr("turnstile-test"),
        )


def test_turnstile_bypass_is_available_only_in_development():
    development = Settings(env="development", turnstile_dev_bypass=True)

    assert asyncio.run(main.verify_turnstile("local-test-token", development)) is True


def test_overlapping_polygon_returns_duplicate_without_satellite_or_ipfs_cost(client, monkeypatch):
    first = client.post("/verify", json=_request())
    assert first.status_code == 200
    satellite_calls = 0
    publish_calls = 0

    def count_satellite(*args):
        nonlocal satellite_calls
        satellite_calls += 1
        return copy.deepcopy(SERIES)

    def count_publish(evidence, settings):
        nonlocal publish_calls
        publish_calls += 1
        return Web3.to_hex(Web3.keccak(canonical_json(evidence))), "ipfs://new"

    monkeypatch.setattr(main, "get_ndvi_series", count_satellite)
    monkeypatch.setattr(main, "publish_evidence", count_publish)

    duplicate = client.post(
        "/verify",
        json=_request(polygon=OVERLAPPING_POLYGON),
    )

    assert duplicate.status_code == 200
    assert duplicate.json()["status"] == "duplicate"
    assert satellite_calls == 0
    assert publish_calls == 0
    assert client.get("/stats").json()["duplicates_blocked"] == 1


def test_shifted_polygon_is_blocked_by_offchain_overlap_check(client, monkeypatch):
    first = client.post("/verify", json=_request())
    assert first.status_code == 200

    shifted_polygon = copy.deepcopy(HEALTHY_POLYGON)
    for coordinate in shifted_polygon["geometry"]["coordinates"][0]:
        coordinate[0] += 0.0001
        coordinate[1] += 0.0001

    satellite_calls = 0
    publish_calls = 0

    def count_satellite(*args):
        nonlocal satellite_calls
        satellite_calls += 1
        return copy.deepcopy(SERIES)

    def count_publish(evidence, settings):
        nonlocal publish_calls
        publish_calls += 1
        return Web3.to_hex(Web3.keccak(canonical_json(evidence))), "ipfs://new"

    monkeypatch.setattr(main.chain, "check_region", lambda cells, settings: True)
    monkeypatch.setattr(main, "get_ndvi_series", count_satellite)
    monkeypatch.setattr(main, "publish_evidence", count_publish)

    duplicate = client.post("/verify", json=_request(polygon=shifted_polygon))

    assert duplicate.status_code == 200
    assert duplicate.json()["status"] == "duplicate"
    assert satellite_calls == 0
    assert publish_calls == 0
    assert client.get("/stats").json()["duplicates_blocked"] == 1


def test_rejected_project_does_not_block_an_overlapping_valid_project(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "score_project",
        lambda series, hectares, source: {
            "vegetation": 40.0,
            "stability": 50.0,
            "consistency": 50.0,
            "total": 45,
            "flags": ["Low vegetation."],
            "flag_codes": ["LOW_VEGETATION"],
            "confidence": "low",
            "seasonal_note": "Compare the same quarter each year.",
        },
    )
    rejected = client.post("/verify", json=_request(polygon=OVERLAPPING_POLYGON))
    assert rejected.json()["status"] == "rejected"

    monkeypatch.setattr(
        main,
        "score_project",
        lambda series, hectares, source: {
            "vegetation": 90.0,
            "stability": 95.0,
            "consistency": 100.0,
            "total": 95,
            "flags": [],
            "flag_codes": [],
            "confidence": "high",
            "seasonal_note": "Compare the same quarter each year.",
        },
    )
    accepted = client.post("/verify", json=_request())

    assert accepted.status_code == 200
    assert accepted.json()["status"] == "verified"


def test_identical_polygon_is_idempotent_and_returns_original_result(client, monkeypatch):
    first = client.post("/verify", json=_request())
    satellite_calls = 0

    def count_satellite(*args):
        nonlocal satellite_calls
        satellite_calls += 1
        return copy.deepcopy(SERIES)

    monkeypatch.setattr(main, "get_ndvi_series", count_satellite)
    second = client.post("/verify", json=_request())

    assert second.json() == first.json()
    assert satellite_calls == 0
    assert client.get("/stats").json()["duplicates_blocked"] == 1


def test_daily_registration_cap_is_persisted(client, monkeypatch):
    settings = Settings(daily_registration_cap=1)
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    first = client.post("/verify", json=_request())
    assert first.status_code == 200

    second_polygon = copy.deepcopy(HEALTHY_POLYGON)
    ring = second_polygon["geometry"]["coordinates"][0]
    for coordinate in ring:
        coordinate[0] += 1.0
    response = client.post("/verify", json=_request(polygon=second_polygon))

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "registration_capacity_reached"
    assert "capacity reached" in response.json()["error"]["message"].lower()


def test_unhandled_error_is_generic_and_logs_are_redacted(client, monkeypatch, capfd):
    def leak_secret(_):
        raise RuntimeError("leak-secret-9f8a")

    monkeypatch.setattr(main, "parse_geojson", leak_secret)
    response = client.post("/verify", json=_request())
    captured = capfd.readouterr()

    assert response.status_code == 500
    assert "leak-secret-9f8a" not in response.text
    assert "leak-secret-9f8a" not in captured.err
    assert response.json()["error"]["code"] == "internal_error"
    assert response.headers["x-request-id"]

    record = logging_record('{"event":"provider","api_key":"secret-test-123"}')
    formatted = JsonLogFormatter().format(record)
    assert "secret-test-123" not in formatted
    assert "[REDACTED]" in formatted


def logging_record(message):
    import logging

    return logging.LogRecord("api-test", logging.INFO, "", 0, message, (), None)


def test_security_headers_are_present_on_all_responses(client):
    for response in (
        client.get("/health"),
        client.post("/verify", json=_request(token=CHALLENGE_DENIED)),
    ):
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        assert response.headers["permissions-policy"]


def test_hsts_is_added_for_https_requests():
    with TestClient(main.app, base_url="https://testserver") as https_client:
        response = https_client.get("/health")

    assert response.headers["strict-transport-security"] == (
        "max-age=31536000; includeSubDomains"
    )
