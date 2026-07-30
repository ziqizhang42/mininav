from array import array

from django.db import connection

from routing.geo import earth_centred_position
from routing.graph import Edge, Graph
from routing.models import RoadEdge
from routing.positions import PackedNodePositions


def load_graph_from_database() -> Graph:
    graph: Graph = {}

    # Only fetch routing fields
    rows = RoadEdge.objects.values_list(
        "id",
        "source_id",
        "target_id",
        "cost_seconds",
        "osm_way_id",
    ).iterator(chunk_size=10_000)

    for edge_id, source, target, cost, osm_way_id in rows:
        edge = Edge(
            id=edge_id,
            source=source,
            target=target,
            cost=cost,
            osm_way_id=osm_way_id,
        )

        graph.setdefault(source, []).append(edge)
        graph.setdefault(target, [])

    return graph


def load_node_positions() -> PackedNodePositions:
    count_sql = "SELECT count(*) FROM road_nodes"
    rows_sql = """
        SELECT osm_id, ST_X(location), ST_Y(location)
        FROM road_nodes
        ORDER BY osm_id
    """

    with connection.cursor() as cursor:
        cursor.execute(count_sql)
        node_count = cursor.fetchone()[0]

    node_ids = array("q", bytes(8 * node_count))
    coordinates = array("d", bytes(24 * node_count))

    index = 0

    with connection.chunked_cursor() as cursor:
        cursor.execute(rows_sql)

        while rows := cursor.fetchmany(10_000):
            for osm_id, longitude, latitude in rows:
                position = earth_centred_position(longitude, latitude)

                if index < node_count:
                    node_ids[index] = osm_id
                    offset = index * 3
                    (
                        coordinates[offset],
                        coordinates[offset + 1],
                        coordinates[offset + 2],
                    ) = position
                else:
                    node_ids.append(osm_id)
                    coordinates.extend(position)

                index += 1

    # Trailing zeroes would break the sort order that lookups binary search
    # over, so anything the count over-allocated has to go.
    if index < node_count:
        del node_ids[index:]
        del coordinates[index * 3 :]

    return PackedNodePositions(node_ids=node_ids, coordinates=coordinates)


def load_top_speed_meters_per_second() -> float:
    """Return the fastest speed any edge is costed at."""
    sql = """
        SELECT max(length_meters / cost_seconds)
        FROM road_edges
        WHERE cost_seconds > 0
    """

    with connection.cursor() as cursor:
        cursor.execute(sql)
        row = cursor.fetchone()

    if row is None or row[0] is None:
        return float("inf")

    return row[0]
