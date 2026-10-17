"""Deterministic project scoring from a bounded NDVI time series."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date
from typing import TypedDict

NDVIPoint = Mapping[str, object]


class ScoreResult(TypedDict):
    vegetation: float
    stability: float
    consistency: float
    total: int
    flags: list[str]
    flag_codes: list[str]
    confidence: str
    seasonal_note: str


def _quarter_index(value: date) -> int:
    return value.year * 4 + (value.month - 1) // 3


def _normalize_series(
    ndvi_series: Sequence[NDVIPoint],
) -> list[tuple[float, date | None]]:
    if not ndvi_series:
        raise ValueError("NDVI series must contain at least one point.")
    if not all(isinstance(point, Mapping) for point in ndvi_series):
        raise ValueError("Every NDVI point must be a mapping.")

    normalized: list[tuple[float, date | None]] = []
    has_dates = all(point.get("date") is not None for point in ndvi_series)
    for point in ndvi_series:
        value = point.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Every NDVI point must have a finite numeric value.")
        try:
            numeric_value = float(value)
        except (OverflowError, ValueError) as exc:
            raise ValueError("Every NDVI point must have a finite numeric value.") from exc
        if not math.isfinite(numeric_value):
            raise ValueError("Every NDVI point must have a finite numeric value.")

        point_date: date | None = None
        if has_dates:
            raw_date = point.get("date")
            if not isinstance(raw_date, str):
                raise ValueError("NDVI point dates must be ISO date strings.")
            try:
                point_date = date.fromisoformat(raw_date[:10])
            except ValueError as exc:
                raise ValueError("NDVI point dates must be ISO date strings.") from exc

        normalized.append((min(1.0, max(-1.0, numeric_value)), point_date))

    if has_dates:
        normalized.sort(key=lambda item: item[1] or date.min)
    return normalized


def _linear_slope(values: list[float], x_values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    x_mean = sum(x_values) / len(x_values)
    y_mean = sum(values) / len(values)
    denominator = sum((x_value - x_mean) ** 2 for x_value in x_values)
    if denominator == 0:
        return 0.0
    return sum(
        (x_value - x_mean) * (value - y_mean)
        for x_value, value in zip(x_values, values)
    ) / denominator


def score_project(
    ndvi_series: Sequence[NDVIPoint],
    claimed_hectares: float,
    source: str,
) -> ScoreResult:
    """Calculate vegetation, stability, and area-consistency scores on a 0-100 scale."""
    if isinstance(claimed_hectares, bool) or not isinstance(claimed_hectares, (int, float)):
        raise ValueError("Claimed hectares must be a positive finite number.")
    try:
        area = float(claimed_hectares)
    except (OverflowError, ValueError) as exc:
        raise ValueError("Claimed hectares must be a positive finite number.") from exc
    if not math.isfinite(area) or area <= 0:
        raise ValueError("Claimed hectares must be a positive finite number.")
    if source not in {"live", "cached"}:
        raise ValueError("Source must be 'live' or 'cached'.")

    observations = _normalize_series(ndvi_series)
    values = [value for value, _ in observations]
    dates = [point_date for _, point_date in observations]
    mean_ndvi = sum(values) / len(values)
    vegetation = round((mean_ndvi + 1.0) * 50.0, 2)

    dated = all(point_date is not None for point_date in dates)
    if dated:
        quarter_indices = [
            float(_quarter_index(point_date))
            for point_date in dates
            if point_date is not None
        ]
        consecutive_drops = [
            max(0.0, values[index - 1] - values[index])
            for index in range(1, len(values))
            if quarter_indices[index] - quarter_indices[index - 1] == 1
        ]
        same_quarter_pairs = {
            (point_date.year, (point_date.month - 1) // 3)
            for point_date in dates
            if point_date is not None
        }
        has_year_over_year_comparison = any(
            (year - 1, quarter) in same_quarter_pairs
            for year, quarter in same_quarter_pairs
        )
    else:
        quarter_indices = [float(index) for index in range(len(values))]
        consecutive_drops = [
            max(0.0, values[index - 1] - values[index])
            for index in range(1, len(values))
        ]
        has_year_over_year_comparison = False

    largest_quarter_drop = max(consecutive_drops, default=0.0)
    negative_slope = max(0.0, -_linear_slope(values, quarter_indices))
    trend_span = max(1.0, max(quarter_indices) - min(quarter_indices) + 1.0)
    stability = round(
        max(
            0.0,
            100.0
            - 100.0 * largest_quarter_drop
            - 100.0 * negative_slope * trend_span,
        ),
        2,
    )

    healthy_fraction = sum(value > 0.5 for value in values) / len(values)
    healthy_area_estimate = area * healthy_fraction
    consistency = round(
        max(
            0.0,
            100.0
            * (1.0 - abs(area - healthy_area_estimate) / area),
        ),
        2,
    )
    total = round(0.4 * vegetation + 0.35 * stability + 0.25 * consistency)

    flag_codes: list[str] = []
    flags: list[str] = []
    if mean_ndvi < 0.5:
        flag_codes.append("LOW_VEGETATION")
        flags.append(f"Mean NDVI is low ({mean_ndvi:.2f}).")
    if largest_quarter_drop >= 0.15:
        flag_codes.append("LARGE_QUARTER_DROP")
        flags.append(f"The largest consecutive-quarter NDVI drop is {largest_quarter_drop:.2f}.")
    if negative_slope >= 0.01:
        flag_codes.append("DECLINING_TREND")
        flags.append(f"The NDVI trend is declining ({_linear_slope(values, quarter_indices):.3f} per quarter).")
    if healthy_fraction < 0.7:
        flag_codes.append("LOW_HEALTHY_AREA")
        flags.append(f"NDVI is above 0.5 in {healthy_fraction:.0%} of observations.")
    if len(values) < 8:
        flag_codes.append("SPARSE_DATA")
        flags.append(f"Only {len(values)} NDVI observations are available.")
    if source == "cached":
        flag_codes.append("CACHED_DATA")
        flags.append("The NDVI observations are cached rather than live.")

    if has_year_over_year_comparison:
        seasonal_note = (
            "Same-quarter observations across years are available; compare those year over "
            "year to account for seasonal variation and avoid false alarms."
        )
    else:
        seasonal_note = (
            "Quarter-to-quarter changes can be seasonal; compare the same quarter year over "
            "year when observations become available to avoid false alarms."
        )

    return {
        "vegetation": vegetation,
        "stability": stability,
        "consistency": consistency,
        "total": total,
        "flags": flags,
        "flag_codes": flag_codes,
        "confidence": "high" if source == "live" and len(values) >= 8 else "low",
        "seasonal_note": seasonal_note,
    }
