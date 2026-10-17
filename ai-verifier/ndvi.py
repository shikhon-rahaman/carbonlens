"""Sentinel-2 NDVI retrieval with bounded remote reads and cached fallback."""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import numpy as np
import requests
from pystac_client import Client
from pystac_client.stac_api_io import StacApiIO
from shapely.geometry import mapping

from geo import GeoJSONError

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
SAS_SIGN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "sample_ndvi.json"
REQUEST_TIMEOUT_SECONDS = 20
MAX_RETRIES = 2
MAX_WINDOW_PIXELS = 1_000_000
MAX_SAMPLE_SIDE = 1024
CLOUD_CLASSES = {0, 1, 3, 8, 9, 10, 11}


class _TimedStacApiIO(StacApiIO):
    """Use bounded connect/read timeouts and retries for every STAC HTTP request."""

    def request(
        self,
        href: str,
        method: str | None = None,
        headers: dict[str, str] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> str:
        request_method = method or "GET"
        request_parameters = parameters if request_method == "GET" else None
        request_json = parameters if request_method == "POST" else None
        last_error: requests.RequestException | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = requests.request(
                    request_method,
                    href,
                    headers=headers,
                    params=request_parameters,
                    json=request_json,
                    timeout=(5, REQUEST_TIMEOUT_SECONDS),
                )
                response.raise_for_status()
                return response.text
            except requests.RequestException as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    time.sleep(0.25 * (attempt + 1))
        if last_error is None:
            raise RuntimeError("STAC request failed without an HTTP response.")
        raise last_error


def _request_json(url: str, *, parameters: dict[str, str] | None = None) -> dict[str, Any]:
    last_error: requests.RequestException | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.get(
                url,
                params=parameters,
                timeout=(5, REQUEST_TIMEOUT_SECONDS),
            )
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError("Remote JSON response must be an object.")
            return result
        except requests.RequestException as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(0.25 * (attempt + 1))
    if last_error is None:
        raise RuntimeError("Remote request failed without an HTTP response.")
    raise last_error


def _sign_item_assets(item: Any) -> None:
    for name in ("B04", "B08", "SCL"):
        asset = item.assets.get(name)
        if asset is None:
            return
        parsed = urlsplit(asset.href)
        hostname = parsed.hostname or ""
        if (
            parsed.scheme != "https"
            or not hostname.endswith(".blob.core.windows.net")
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError("Sentinel-2 asset URL is not a trusted Planetary Computer blob URL.")
        signed_response = _request_json(SAS_SIGN_URL, parameters={"href": asset.href})
        signed_href = signed_response.get("href")
        if not isinstance(signed_href, str):
            raise ValueError("Planetary Computer signing response is malformed.")
        asset.href = signed_href


def _quarter_start(timestamp: datetime) -> date:
    month = ((timestamp.month - 1) // 3) * 3 + 1
    return date(timestamp.year, month, 1)


def _project_polygon(dataset: Any, polygon: Any) -> Any:
    if dataset.crs is None:
        raise ValueError("Raster asset has no coordinate reference system.")
    if str(dataset.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
        from pyproj import Transformer
        from shapely import transform as shapely_transform

        to_raster = Transformer.from_crs("EPSG:4326", dataset.crs, always_xy=True)
        return shapely_transform(polygon, to_raster.transform, interleaved=False)
    return polygon


def _safe_window(dataset: Any, raster_polygon: Any) -> Any:
    from rasterio.windows import Window, from_bounds

    bounds = raster_polygon.bounds

    raw_window = from_bounds(*bounds, transform=dataset.transform)
    col_start = max(0, math.floor(raw_window.col_off))
    row_start = max(0, math.floor(raw_window.row_off))
    col_stop = min(dataset.width, math.ceil(raw_window.col_off + raw_window.width))
    row_stop = min(dataset.height, math.ceil(raw_window.row_off + raw_window.height))
    if col_stop <= col_start or row_stop <= row_start:
        raise ValueError("Polygon does not intersect the selected raster tile.")
    window = Window(col_start, row_start, col_stop - col_start, row_stop - row_start)
    if window.width * window.height > MAX_WINDOW_PIXELS:
        raise ValueError("Raster read exceeds the configured memory cap.")
    return window


def _read_asset(item: Any, polygon: Any) -> float | None:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.features import geometry_mask

    assets = item.assets
    if not all(key in assets for key in ("B04", "B08", "SCL")):
        return None

    _sign_item_assets(item)
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with rasterio.Env(
                GDAL_HTTP_TIMEOUT=REQUEST_TIMEOUT_SECONDS,
                GDAL_HTTP_MAX_RETRY=0,
                GDAL_HTTP_RETRY_DELAY=1,
                GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            ):
                with rasterio.open(assets["B04"].href) as red_dataset, rasterio.open(
                    assets["B08"].href
                ) as nir_dataset, rasterio.open(assets["SCL"].href) as scl_dataset:
                    raster_polygon = _project_polygon(red_dataset, polygon)
                    red_window = _safe_window(red_dataset, raster_polygon)
                    nir_polygon = _project_polygon(nir_dataset, polygon)
                    nir_window = _safe_window(nir_dataset, nir_polygon)
                    scl_polygon = _project_polygon(scl_dataset, polygon)
                    scl_window = _safe_window(scl_dataset, scl_polygon)
                    out_height = max(1, min(MAX_SAMPLE_SIDE, int(red_window.height)))
                    out_width = max(1, min(MAX_SAMPLE_SIDE, int(red_window.width)))
                    output_shape = (out_height, out_width)
                    red = red_dataset.read(
                        1, window=red_window, out_shape=output_shape, resampling=Resampling.average, masked=True
                    ).astype(np.float32)
                    nir = nir_dataset.read(
                        1, window=nir_window, out_shape=output_shape, resampling=Resampling.average, masked=True
                    ).astype(np.float32)
                    scl = scl_dataset.read(
                        1, window=scl_window, out_shape=output_shape, resampling=Resampling.nearest, masked=True
                    )
                    if red.shape != nir.shape or red.shape != scl.shape:
                        raise ValueError("Sentinel-2 band grids do not align.")

                    valid_polygon = geometry_mask(
                        [mapping(raster_polygon)],
                        out_shape=output_shape,
                        transform=red_dataset.window_transform(red_window)
                        * red_dataset.transform.scale(
                            red_window.width / out_width, red_window.height / out_height
                        ),
                        invert=True,
                        all_touched=True,
                    )
                    red_values = np.asarray(red.filled(np.nan), dtype=np.float32)
                    nir_values = np.asarray(nir.filled(np.nan), dtype=np.float32)
                    scl_values = np.asarray(scl.filled(0))
                    denominator = nir_values + red_values
                    valid = (
                        valid_polygon
                        & ~np.ma.getmaskarray(red)
                        & ~np.ma.getmaskarray(nir)
                        & ~np.ma.getmaskarray(scl)
                        & ~np.isin(scl_values, tuple(CLOUD_CLASSES))
                        & np.isfinite(denominator)
                        & (denominator > 0)
                    )
                    if not np.any(valid):
                        return None
                    ndvi = (nir_values[valid] - red_values[valid]) / denominator[valid]
                    ndvi = ndvi[np.isfinite(ndvi)]
                    if ndvi.size == 0:
                        return None
                    return float(np.mean(ndvi))
        except Exception as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                time.sleep(0.25 * (attempt + 1))
    if last_error is None:
        raise RuntimeError("Raster read failed without an error.")
    raise last_error


def _load_cached_series(cache_key: str) -> list[dict[str, Any]]:
    with CACHE_PATH.open("r", encoding="utf-8") as cache_file:
        cache = json.load(cache_file)
    if not isinstance(cache, dict) or cache_key not in cache:
        raise ValueError(f"NDVI cache has no series named {cache_key!r}.")
    points = cache[cache_key]
    if not isinstance(points, list) or not points:
        raise ValueError(f"Cached NDVI series {cache_key!r} is empty or malformed.")
    for point in points:
        if not isinstance(point, dict) or "date" not in point or "value" not in point:
            raise ValueError(f"Cached NDVI series {cache_key!r} contains a malformed point.")
    return [{"date": point["date"], "value": point["value"], "source": "cached"} for point in points]


def get_cached_ndvi_series(cache_key: str = "healthy_forest") -> list[dict[str, Any]]:
    """Return one reviewed packaged series without making satellite-provider requests."""
    return _load_cached_series(cache_key)


def get_ndvi_series(
    polygon: Any,
    start_year: int,
    end_year: int,
    *,
    cache_key: str = "healthy_forest",
) -> list[dict[str, Any]]:
    """Return quarterly Sentinel-2 median NDVI or the named packaged cache on failure."""
    try:
        if start_year < 2015 or end_year < start_year or end_year - start_year > 20:
            raise ValueError("Year range must be between 2015 and 20 years long.")
        if not getattr(polygon, "is_valid", False) or polygon.is_empty:
            raise GeoJSONError("NDVI retrieval requires a valid, non-empty Polygon.")

        search_polygon = mapping(polygon)
        io = _TimedStacApiIO()
        client = Client.open(STAC_URL, stac_io=io)
        search = client.search(
            collections=["sentinel-2-l2a"],
            intersects=search_polygon,
            datetime=f"{start_year}-01-01T00:00:00Z/{end_year}-12-31T23:59:59Z",
            query={"eo:cloud_cover": {"lt": 20}},
            max_items=500,
        )

        quarterly: dict[date, list[float]] = defaultdict(list)
        for item in search.items():
            cloud_cover = item.properties.get("eo:cloud_cover")
            if cloud_cover is None or float(cloud_cover) >= 20:
                continue
            scene_value = _read_asset(item, polygon)
            if scene_value is None:
                continue
            timestamp = item.datetime
            if timestamp is None:
                continue
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            quarterly[_quarter_start(timestamp)].append(scene_value)

        if not quarterly:
            raise RuntimeError("No usable Sentinel-2 scenes were returned.")
        return [
            {
                "date": quarter.isoformat(),
                "value": float(np.median(values)),
                "source": "live"
            }
            for quarter, values in sorted(quarterly.items())
        ]
    except Exception:
        return _load_cached_series(cache_key)
