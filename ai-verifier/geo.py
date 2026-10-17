"""Bounded GeoJSON validation and geospatial overlap utilities."""

from __future__ import annotations

import json
import math
from collections.abc import Iterable, Mapping
from typing import Any

import geohash2
from pyproj import Transformer
from shapely import make_valid, transform as shapely_transform
from shapely.geometry import Polygon, shape
from web3 import Web3

MAX_GEOJSON_BYTES = 200 * 1024
MAX_VERTICES = 500
MAX_HOLES = 10
MIN_AREA_HECTARES = 1.0
MAX_AREA_HECTARES = 50_000.0
GEOHASH_PRECISION = 6
MAX_REGION_CELLS = 512
_EQUAL_AREA = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)


class GeoJSONError(ValueError):
    """Raised when input geometry is invalid or outside supported limits."""


def _decode_geojson(value: str | bytes | bytearray | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(value, (bytes, bytearray)):
        if len(value) > MAX_GEOJSON_BYTES:
            raise GeoJSONError("GeoJSON exceeds the 200 KB limit.")
        try:
            decoded = json.loads(value)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GeoJSONError("GeoJSON is not valid UTF-8 JSON.") from exc
    elif isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_GEOJSON_BYTES:
            raise GeoJSONError("GeoJSON exceeds the 200 KB limit.")
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError as exc:
            raise GeoJSONError("GeoJSON is not valid JSON.") from exc
    elif isinstance(value, Mapping):
        try:
            encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise GeoJSONError("GeoJSON object cannot be serialized.") from exc
        if len(encoded) > MAX_GEOJSON_BYTES:
            raise GeoJSONError("GeoJSON exceeds the 200 KB limit.")
        decoded = value
    else:
        raise GeoJSONError("GeoJSON must be a mapping, JSON string, or bytes.")

    if not isinstance(decoded, Mapping):
        raise GeoJSONError("GeoJSON root must be an object.")
    return decoded


def _one_polygon(document: Mapping[str, Any]) -> Mapping[str, Any]:
    kind = document.get("type")
    if kind == "Polygon":
        geometry = document
    elif kind == "Feature":
        geometry = document.get("geometry")
        if not isinstance(geometry, Mapping):
            raise GeoJSONError("Feature must contain a geometry.")
    elif kind == "FeatureCollection":
        features = document.get("features")
        if not isinstance(features, list):
            raise GeoJSONError("FeatureCollection features must be an array.")
        geometries = [
            feature.get("geometry")
            for feature in features
            if isinstance(feature, Mapping) and isinstance(feature.get("geometry"), Mapping)
        ]
        if len(geometries) != 1:
            raise GeoJSONError("FeatureCollection must contain exactly one geometry.")
        geometry = geometries[0]
    else:
        raise GeoJSONError("Expected a Polygon, Feature, or FeatureCollection.")

    if geometry.get("type") != "Polygon":
        raise GeoJSONError("Only Polygon geometry is supported; MultiPolygon is rejected.")
    return geometry


def _count_vertices(coordinates: Any) -> tuple[int, int]:
    if not isinstance(coordinates, list) or not coordinates:
        raise GeoJSONError("Polygon coordinates must contain an exterior ring.")
    if len(coordinates) - 1 > MAX_HOLES:
        raise GeoJSONError(f"Polygons may contain at most {MAX_HOLES} holes.")

    vertex_count = 0
    for ring in coordinates:
        if not isinstance(ring, list) or len(ring) < 4:
            raise GeoJSONError("Each polygon ring must contain at least four positions.")
        if ring[0] != ring[-1]:
            raise GeoJSONError("Polygon rings must be closed.")
        for position in ring:
            if (
                not isinstance(position, list)
                or len(position) != 2
                or any(
                    isinstance(coordinate, bool)
                    or not isinstance(coordinate, (int, float))
                    or not math.isfinite(coordinate)
                    for coordinate in position
                )
            ):
                raise GeoJSONError("Each position must contain exactly two numeric coordinates.")
        vertex_count += len(ring) - 1
    if vertex_count > MAX_VERTICES:
        raise GeoJSONError(
            f"Polygon exceeds the {MAX_VERTICES}-vertex limit "
            f"({MAX_VERTICES} vertices maximum)."
        )
    return vertex_count, len(coordinates) - 1


def area_hectares(polygon: Polygon) -> float:
    """Return the EPSG:6933 equal-area projected area in hectares."""
    if not isinstance(polygon, Polygon):
        raise GeoJSONError("Area calculation requires a Polygon.")
    if not polygon.is_valid or polygon.is_empty:
        raise GeoJSONError("Area calculation requires a valid non-empty Polygon.")
    for ring in (polygon.exterior, *polygon.interiors):
        for longitude, latitude in ring.coords:
            if not (-180.0 <= longitude <= 180.0 and -90.0 <= latitude <= 90.0):
                raise GeoJSONError("Coordinates must be within longitude/latitude ranges.")
    projected = shapely_transform(polygon, _EQUAL_AREA.transform, interleaved=False)
    return projected.area / 10_000.0


def parse_geojson(value: str | bytes | bytearray | Mapping[str, Any]) -> Polygon:
    """Parse and validate one bounded WGS84 GeoJSON Polygon."""
    document = _decode_geojson(value)
    geometry = _one_polygon(document)
    _count_vertices(geometry.get("coordinates"))

    try:
        polygon = shape(geometry)
    except (TypeError, ValueError) as exc:
        raise GeoJSONError("Polygon coordinates are malformed.") from exc
    if not isinstance(polygon, Polygon) or polygon.is_empty:
        raise GeoJSONError("Polygon geometry is empty or unsupported.")

    for longitude, latitude in polygon.exterior.coords:
        if not (
            math.isfinite(longitude)
            and math.isfinite(latitude)
            and -180.0 <= longitude <= 180.0
            and -90.0 <= latitude <= 90.0
        ):
            raise GeoJSONError("Coordinates must be within longitude/latitude ranges.")
    for ring in polygon.interiors:
        for longitude, latitude in ring.coords:
            if not (
                math.isfinite(longitude)
                and math.isfinite(latitude)
                and -180.0 <= longitude <= 180.0
                and -90.0 <= latitude <= 90.0
            ):
                raise GeoJSONError("Coordinates must be within longitude/latitude ranges.")

    if not polygon.is_valid:
        repaired = make_valid(polygon)
        if not repaired.is_valid or repaired.geom_type != "Polygon":
            raise GeoJSONError("Invalid or self-intersecting polygons are rejected.")
        raise GeoJSONError("Invalid polygon would require repair and is rejected.")

    hectares = area_hectares(polygon)
    if not MIN_AREA_HECTARES <= hectares <= MAX_AREA_HECTARES:
        raise GeoJSONError(
            f"Polygon area must be between {MIN_AREA_HECTARES:g} and "
            f"{MAX_AREA_HECTARES:g} hectares."
        )
    return polygon


def _geohash_grid(polygon: Polygon) -> tuple[float, float, float, float, int, int]:
    # Decode one hash only to obtain the precision-specific cell dimensions.
    sample = geohash2.encode(0.0, 0.0, GEOHASH_PRECISION)
    _, _, latitude_error, longitude_error = geohash2.decode_exactly(sample)
    latitude_step = latitude_error * 2
    longitude_step = longitude_error * 2
    min_x, min_y, max_x, max_y = polygon.bounds
    longitude_count = int((max_x + 180.0) // longitude_step) - int((min_x + 180.0) // longitude_step) + 1
    latitude_count = int((max_y + 90.0) // latitude_step) - int((min_y + 90.0) // latitude_step) + 1
    return min_x, min_y, max_x, max_y, longitude_count, latitude_count


def polygon_to_cells(polygon: Polygon, *, expand_neighbors: bool = False) -> list[str]:
    """Return intersecting precision-6 geohashes; optionally include their 8 neighbors."""
    if not isinstance(polygon, Polygon) or polygon.is_empty or not polygon.is_valid:
        raise GeoJSONError("Cell generation requires a valid non-empty Polygon.")
    hectares = area_hectares(polygon)
    if not MIN_AREA_HECTARES <= hectares <= MAX_AREA_HECTARES:
        raise GeoJSONError(
            f"Polygon area must be between {MIN_AREA_HECTARES:g} and "
            f"{MAX_AREA_HECTARES:g} hectares."
        )

    min_x, min_y, max_x, max_y, longitude_count, latitude_count = _geohash_grid(polygon)
    candidate_count = longitude_count * latitude_count
    # Reject before iterating a potentially enormous bounding box.
    if candidate_count > MAX_REGION_CELLS * 4:
        raise GeoJSONError("Polygon covers too many geohash cells.")

    precision = GEOHASH_PRECISION
    _, _, lat_error, lon_error = geohash2.decode_exactly(geohash2.encode(0.0, 0.0, precision))
    lat_step = 2 * lat_error
    lon_step = 2 * lon_error
    lon_start = max(-180.0, -180.0 + int((min_x + 180.0) // lon_step) * lon_step)
    lat_start = max(-90.0, -90.0 + int((min_y + 90.0) // lat_step) * lat_step)
    selected: set[str] = set()

    for lon_index in range(longitude_count):
        longitude = lon_start + (lon_index + 0.5) * lon_step
        if longitude > 180:
            continue
        for lat_index in range(latitude_count):
            latitude = lat_start + (lat_index + 0.5) * lat_step
            if latitude > 90:
                continue
            cell = geohash2.encode(latitude, longitude, precision)
            if polygon.intersects(_geohash_polygon(cell)):
                selected.add(cell)
                if len(selected) > MAX_REGION_CELLS:
                    raise GeoJSONError("Polygon covers too many geohash cells.")

    if expand_neighbors:
        expanded = set(selected)
        for cell in selected:
            expanded.update(_neighbor_hashes(cell))
        selected = expanded
    if len(selected) > MAX_REGION_CELLS:
        raise GeoJSONError("Expanded polygon covers too many geohash cells.")
    return sorted(selected)


def _geohash_polygon(cell: str) -> Polygon:
    latitude, longitude, latitude_error, longitude_error = geohash2.decode_exactly(cell)
    return Polygon(
        [
            (longitude - longitude_error, latitude - latitude_error),
            (longitude + longitude_error, latitude - latitude_error),
            (longitude + longitude_error, latitude + latitude_error),
            (longitude - longitude_error, latitude + latitude_error),
            (longitude - longitude_error, latitude - latitude_error),
        ]
    )


def _neighbor_hashes(cell: str) -> set[str]:
    latitude, longitude, latitude_error, longitude_error = geohash2.decode_exactly(cell)
    return {
        geohash2.encode(
            latitude + latitude_offset * latitude_error * 2,
            longitude + longitude_offset * longitude_error * 2,
            GEOHASH_PRECISION,
        )
        for latitude_offset in (-1, 0, 1)
        for longitude_offset in (-1, 0, 1)
        if latitude_offset != 0 or longitude_offset != 0
        if -90 <= latitude + latitude_offset * latitude_error * 2 <= 90
        and -180 <= longitude + longitude_offset * longitude_error * 2 <= 180
    }


def cells_to_bytes32(cells: Iterable[str]) -> list[bytes]:
    """Hash geohash strings with Ethereum Keccak-256 into contract-compatible bytes32 values."""
    result = []
    for cell in cells:
        if (
            not isinstance(cell, str)
            or len(cell) != GEOHASH_PRECISION
            or any(character not in "0123456789bcdefghjkmnpqrstuvwxyz" for character in cell)
        ):
            raise GeoJSONError("Each cell must be a precision-6 geohash string.")
        result.append(Web3.keccak(text=cell))
    return result


def overlap_ratio(poly_a: Polygon, poly_b: Polygon) -> float:
    """Return intersection area divided by the smaller polygon's equal-area projected area."""
    if not isinstance(poly_a, Polygon) or not isinstance(poly_b, Polygon):
        raise GeoJSONError("Overlap calculation requires two Polygons.")
    if not poly_a.is_valid or not poly_b.is_valid or poly_a.is_empty or poly_b.is_empty:
        raise GeoJSONError("Overlap calculation requires valid non-empty Polygons.")

    project = _EQUAL_AREA.transform
    projected_a = shapely_transform(poly_a, project, interleaved=False)
    projected_b = shapely_transform(poly_b, project, interleaved=False)
    smaller_area = min(projected_a.area, projected_b.area)
    if smaller_area <= 0:
        return 0.0
    return projected_a.intersection(projected_b).area / smaller_area


def find_overlaps(
    polygon: Polygon,
    existing_polygons: Iterable[Mapping[str, Any]],
    threshold: float = 0.05,
    *,
    expand_neighbors: bool = True,
) -> list[Any]:
    """Return existing IDs whose polygons overlap enough or share expanded geohash cells."""
    if not 0 <= threshold <= 1:
        raise ValueError("Overlap threshold must be between 0 and 1.")
    candidate_cells = set(polygon_to_cells(polygon, expand_neighbors=expand_neighbors))
    conflicts = []
    for entry in existing_polygons:
        if not isinstance(entry, Mapping) or "id" not in entry or not isinstance(entry.get("polygon"), Polygon):
            raise GeoJSONError("Existing polygons must be mappings with id and Polygon fields.")
        existing_polygon = entry["polygon"]
        ratio = overlap_ratio(polygon, existing_polygon)
        shares_expanded_cell = bool(
            candidate_cells.intersection(
                polygon_to_cells(existing_polygon, expand_neighbors=expand_neighbors)
            )
        )
        if ratio >= threshold and ratio > 0 or shares_expanded_cell:
            conflicts.append(entry["id"])
    return conflicts
