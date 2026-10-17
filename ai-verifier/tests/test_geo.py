import json
from pathlib import Path

import pytest
from shapely.geometry import Polygon

from geo import (
    MAX_GEOJSON_BYTES,
    MAX_HOLES,
    GeoJSONError,
    area_hectares,
    cells_to_bytes32,
    find_overlaps,
    overlap_ratio,
    parse_geojson,
    polygon_to_cells,
)

DATA = Path(__file__).resolve().parents[2] / "data"


def load_polygon(name):
    return parse_geojson((DATA / name).read_text(encoding="utf-8"))


def polygon_document(coordinates):
    return {"type": "Polygon", "coordinates": coordinates}


def test_accepts_polygon_feature_and_single_polygon_feature_collection():
    feature = json.loads((DATA / "forest_healthy.geojson").read_text(encoding="utf-8"))
    polygon = parse_geojson(feature)
    assert polygon.area > 0
    assert parse_geojson(feature["geometry"]).equals(polygon)
    assert parse_geojson({"type": "FeatureCollection", "features": [feature]}).equals(polygon)


@pytest.mark.parametrize(
    "document",
    [
        {"type": "MultiPolygon", "coordinates": []},
        {"type": "FeatureCollection", "features": []},
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []}},
                {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []}},
            ],
        },
        {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [0, 0], [0.02, 0.02], [0, 0.02], [0.02, 0], [0, 0]
                ]],
            },
        },
        polygon_document([[
            [181, 0], [181.01, 0], [181.01, 0.01], [181, 0.01], [181, 0]
        ]]),
        polygon_document([[
            [0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0.0001], [0, 0]
        ]]),
        polygon_document([[
            [0, 0], [1, 0], [1, 1], [0, 1], [0, 0]
        ]]),
    ],
)
def test_rejects_unsupported_or_invalid_geometry(document):
    with pytest.raises(GeoJSONError):
        parse_geojson(document)


def test_rejects_too_many_vertices():
    ring = [[-60.0 + index * 0.00001, -3.0] for index in range(500)]
    ring.extend([[-60.0, -2.99], [-60.0, -3.0]])
    with pytest.raises(GeoJSONError, match="vertices"):
        parse_geojson(polygon_document([ring]))


def test_rejects_geojson_over_200_kb():
    oversized = b" " * (MAX_GEOJSON_BYTES + 1)
    with pytest.raises(GeoJSONError, match="200 KB"):
        parse_geojson(oversized)


def test_area_is_plausible_for_sample_polygon():
    polygon = load_polygon("forest_healthy.geojson")
    assert 35 <= area_hectares(polygon) <= 50


def test_accepts_limited_holes_and_rejects_excessive_holes():
    exterior = [
        [-60.0, -3.0],
        [-59.994, -3.0],
        [-59.994, -2.994],
        [-60.0, -2.994],
        [-60.0, -3.0],
    ]
    hole = [
        [-59.999, -2.999],
        [-59.997, -2.999],
        [-59.997, -2.997],
        [-59.999, -2.997],
        [-59.999, -2.999],
    ]
    with_hole = parse_geojson(polygon_document([exterior, hole]))
    assert len(with_hole.interiors) == 1

    holes = []
    for index in range(MAX_HOLES + 1):
        offset = index * 0.0002
        holes.append([
            [-59.999 + offset, -2.999],
            [-59.9989 + offset, -2.999],
            [-59.9989 + offset, -2.9989],
            [-59.999 + offset, -2.9989],
            [-59.999 + offset, -2.999],
        ])
    with pytest.raises(GeoJSONError, match="holes"):
        parse_geojson(polygon_document([exterior, *holes]))


def test_precision_six_cells_hash_to_bytes32():
    cells = polygon_to_cells(load_polygon("forest_healthy.geojson"))
    hashes = cells_to_bytes32(cells)
    assert cells
    assert all(len(cell) == 6 for cell in cells)
    assert all(len(value) == 32 for value in hashes)
    with pytest.raises(GeoJSONError, match="precision-6"):
        cells_to_bytes32(["invalid"])


def test_polygon_cell_cap_rejects_instead_of_truncating():
    large_polygon = Polygon(
        [
            (-60.0, -3.0),
            (-59.8, -3.0),
            (-59.8, -2.85),
            (-60.0, -2.85),
            (-60.0, -3.0),
        ]
    )
    with pytest.raises(GeoJSONError, match="too many geohash cells"):
        polygon_to_cells(large_polygon)


def test_overlap_ratio_and_overlap_ids_find_real_overlap():
    healthy = load_polygon("forest_healthy.geojson")
    overlap = load_polygon("forest_overlap.geojson")
    assert overlap_ratio(healthy, overlap) >= 0.4
    assert find_overlaps(
        healthy,
        [{"id": "partial", "polygon": overlap}],
        threshold=0.05,
        expand_neighbors=False,
    ) == ["partial"]


def test_neighbor_expansion_flags_nearby_shifted_polygon():
    healthy = load_polygon("forest_healthy.geojson")
    shifted = Polygon(
        [
            (-59.9900, -3.0000),
            (-59.9840, -3.0000),
            (-59.9840, -2.9940),
            (-59.9900, -2.9940),
            (-59.9900, -3.0000),
        ]
    )
    assert overlap_ratio(healthy, shifted) == 0
    assert find_overlaps(
        healthy,
        [{"id": "shifted", "polygon": shifted}],
        threshold=0.05,
        expand_neighbors=True,
    ) == ["shifted"]
