from dataclasses import dataclass

from django.db import connection


@dataclass(frozen=True, slots=True)
class SnappedNode:
    node_id: int
    longitude: float
    latitude: float
    distance_meters: float


def nearest_node(longitude: float, latitude: float) -> SnappedNode:
    if not -180 <= longitude <= 180:
        raise ValueError("Longitude must be between -180 and 180")

    if not -90 <= latitude <= 90:
        raise ValueError("Latitude must be between -90 and 90")

    sql = """
        WITH requested_point AS (
            SELECT ST_SetSRID(
                ST_MakePoint(%s, %s),
                4326
            ) AS location
        )
        SELECT
            node.osm_id,
            ST_X(node.location),
            ST_Y(node.location),
            ST_Distance(
                node.location::geography,
                requested.location::geography
            )
        FROM road_nodes AS node
        CROSS JOIN requested_point AS requested
        WHERE node.osm_id > 0
        ORDER BY node.location <-> requested.location
        LIMIT 1
    """

    with connection.cursor() as cursor:
        cursor.execute(sql, [longitude, latitude])
        row = cursor.fetchone()

    if row is None:
        raise ValueError("The road graph is empty")

    return SnappedNode(
        node_id=row[0],
        longitude=row[1],
        latitude=row[2],
        distance_meters=row[3],
    )
