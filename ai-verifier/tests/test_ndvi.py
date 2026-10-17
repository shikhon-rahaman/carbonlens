import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
import requests

from geo import parse_geojson
from ndvi import (
    MAX_RETRIES,
    REQUEST_TIMEOUT_SECONDS,
    _TimedStacApiIO,
    _sign_item_assets,
    get_cached_ndvi_series,
    get_ndvi_series,
)

DATA = Path(__file__).resolve().parents[2] / "data"


def healthy_polygon():
    return parse_geojson((DATA / "forest_healthy.geojson").read_text(encoding="utf-8"))


def test_sample_series_have_twelve_quarterly_points_and_expected_shapes():
    series = json.loads((DATA / "sample_ndvi.json").read_text(encoding="utf-8"))
    assert {key: len(points) for key, points in series.items()} == {
        "healthy_forest": 12,
        "deforested": 12,
        "degraded": 12,
    }
    assert min(point["value"] for point in series["healthy_forest"]) >= 0.8
    assert series["deforested"][5]["value"] < series["deforested"][4]["value"] - 0.3
    assert series["degraded"][0]["value"] > series["degraded"][-1]["value"]


def test_network_failure_returns_named_cached_series_with_source(monkeypatch):
    def fail_stac(*args, **kwargs):
        raise TimeoutError("simulated STAC timeout")

    monkeypatch.setattr("ndvi.Client.open", fail_stac)
    result = get_ndvi_series(healthy_polygon(), 2023, 2025, cache_key="deforested")
    assert len(result) == 12
    assert all(point["source"] == "cached" for point in result)
    assert result[0]["value"] == 0.82


def test_cached_demo_series_loads_packaged_data_without_network():
    healthy = get_cached_ndvi_series()
    deforested = get_cached_ndvi_series("deforested")

    assert len(healthy) == len(deforested) == 12
    assert all(point["source"] == "cached" for point in healthy + deforested)
    assert deforested[0]["value"] == 0.82


def test_invalid_years_fall_back_to_cache():
    with patch("ndvi.Client.open", side_effect=RuntimeError("must not run")):
        result = get_ndvi_series(healthy_polygon(), 2040, 2020)
    assert len(result) == 12
    assert all(point["source"] == "cached" for point in result)


def test_stac_requests_use_timeout_and_at_most_two_retries():
    with patch("ndvi.requests.request", side_effect=requests.Timeout("offline")) as request:
        with pytest.raises(requests.Timeout):
            _TimedStacApiIO().request("https://planetarycomputer.microsoft.com/api/stac/v1")

    assert request.call_count == MAX_RETRIES + 1
    assert all(
        call.kwargs["timeout"] == (5, REQUEST_TIMEOUT_SECONDS)
        for call in request.call_args_list
    )


def test_stac_api_io_returns_text_and_posts_search_parameters_as_json():
    response = SimpleNamespace(text='{"type":"FeatureCollection","features":[]}')
    response.raise_for_status = lambda: None
    with patch("ndvi.requests.request", return_value=response) as request:
        result = _TimedStacApiIO().request(
            "https://planetarycomputer.microsoft.com/api/stac/v1/search",
            method="POST",
            headers={"Content-Type": "application/json"},
            parameters={"collections": ["sentinel-2-l2a"]},
        )

    assert result == response.text
    assert request.call_args.kwargs["json"] == {"collections": ["sentinel-2-l2a"]}
    assert request.call_args.kwargs["timeout"] == (5, REQUEST_TIMEOUT_SECONDS)


def test_asset_signer_rejects_non_planetary_computer_hosts_without_requesting():
    item = SimpleNamespace(
        assets={
            "B04": SimpleNamespace(href="https://attacker.example/asset.tif"),
            "B08": SimpleNamespace(href="https://storage.blob.core.windows.net/nir.tif"),
            "SCL": SimpleNamespace(href="https://storage.blob.core.windows.net/scl.tif"),
        }
    )
    with patch("ndvi.requests.get") as request:
        with pytest.raises(ValueError, match="trusted Planetary Computer"):
            _sign_item_assets(item)
    request.assert_not_called()
