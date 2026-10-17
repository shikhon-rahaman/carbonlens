import json
from pathlib import Path

from scoring import score_project

DATA = Path(__file__).resolve().parents[2] / "data"


def load_series(name):
    return json.loads((DATA / "sample_ndvi.json").read_text(encoding="utf-8"))[name]


def test_healthy_series_scores_at_least_80():
    result = score_project(load_series("healthy_forest"), 40, "live")

    assert result["total"] >= 80
    assert result["vegetation"] >= 80
    assert result["confidence"] == "high"
    assert result["flags"] == []
    assert "same-quarter" in result["seasonal_note"].lower()


def test_deforested_series_scores_below_60_and_has_decline_flags():
    result = score_project(load_series("deforested"), 40, "live")

    assert result["total"] < 60
    assert "LARGE_QUARTER_DROP" in result["flag_codes"]
    assert "DECLINING_TREND" in result["flag_codes"]


def test_degraded_series_scores_between_deforested_and_healthy():
    result = score_project(load_series("degraded"), 40, "live")

    assert 60 <= result["total"] < 80


def test_cached_or_sparse_series_have_low_confidence():
    result = score_project(load_series("healthy_forest")[:3], 40, "cached")

    assert result["confidence"] == "low"
    assert "CACHED_DATA" in result["flag_codes"]
    assert "SPARSE_DATA" in result["flag_codes"]


def test_invalid_ndvi_and_claimed_area_are_rejected():
    try:
        score_project([{"value": float("nan")}], 40, "live")
    except ValueError as exc:
        assert "finite numeric" in str(exc)
    else:
        raise AssertionError("non-finite NDVI should be rejected")

    try:
        score_project([{"value": 0.8}], 0, "live")
    except ValueError as exc:
        assert "positive finite" in str(exc)
    else:
        raise AssertionError("non-positive claimed area should be rejected")
