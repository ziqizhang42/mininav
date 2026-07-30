from dataclasses import dataclass

from django.db import connection


@dataclass(frozen=True, slots=True)
class SnappedEdge:
    edge_id: int
    osm_way_id: int
    segment_index: int
    source_node_id: int
    target_node_id: int
    longitude: float
    latitude: float
    distance_meters: float

    # How far along the edge the point sits, measured in the degrees the
    # geometry is stored in. Correct for slicing geometry and for comparing
    # positions, but not proportional to physical distance.
    fraction: float

    # The same position as a share of the edge's real length. Costs and lengths
    # must use this one. A compressed edge that changes direction covers very
    # different ground per degree on each of its parts.
    physical_fraction: float

    length_meters: float
    cost_seconds: float


def validate_coordinate(longitude: float, latitude: float) -> None:
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180")

    if not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90")


def nearest_edge(longitude: float, latitude: float) -> SnappedEdge:
    validate_coordinate(longitude, latitude)

    sql = """
        WITH requested_point AS (
            SELECT ST_SetSRID(
                ST_MakePoint(%s, %s),
                4326
            ) AS location
        ),
        candidates AS (
            SELECT
                edge.id,
                edge.osm_way_id,
                edge.segment_index,
                edge.source_node_id,
                edge.target_node_id,
                edge.length_meters,
                edge.cost_seconds,
                edge.geometry,
                ST_LineLocatePoint(edge.geometry, requested.location) AS fraction,
                requested.location AS requested_location
            FROM road_edges AS edge
            CROSS JOIN requested_point AS requested
            ORDER BY edge.geometry <-> requested.location
            LIMIT 1
        ),
        snapped AS (
            SELECT
                id,
                osm_way_id,
                segment_index,
                source_node_id,
                target_node_id,
                length_meters,
                cost_seconds,
                fraction,
                -- Spherical, not spheroidal: PostGIS derives its sphere from
                -- the WGS84 mean radius, which is the same sphere the importer
                -- measured `length_meters` on. Spheroidal length disagrees with
                -- it by up to a third of a percent, enough to misprice a
                -- connector. Note that a literal per-cent sign here would be
                -- read as a query placeholder.
                COALESCE(
                    ST_Length(
                        ST_LineSubstring(geometry, 0, fraction)::geography,
                        false
                    ) / NULLIF(ST_Length(geometry::geography, false), 0),
                    0
                ) AS physical_fraction,
                ST_LineInterpolatePoint(geometry, fraction) AS location,
                requested_location
            FROM candidates
        )
        SELECT
            id,
            osm_way_id,
            segment_index,
            source_node_id,
            target_node_id,
            ST_X(location),
            ST_Y(location),
            ST_Distance(location::geography, requested_location::geography),
            fraction,
            physical_fraction,
            length_meters,
            cost_seconds
        FROM snapped
    """

    with connection.cursor() as cursor:
        cursor.execute(sql, [longitude, latitude])
        row = cursor.fetchone()

    if row is None:
        raise ValueError("The road graph is empty")

    return SnappedEdge(
        edge_id=row[0],
        osm_way_id=row[1],
        segment_index=row[2],
        source_node_id=row[3],
        target_node_id=row[4],
        longitude=row[5],
        latitude=row[6],
        distance_meters=row[7],
        fraction=row[8],
        physical_fraction=row[9],
        length_meters=row[10],
        cost_seconds=row[11],
    )
