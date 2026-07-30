from array import array

from django.db import connection

from routing.geo import earth_centred_position
from routing.graph import NO_WAY_ID, RoadGraph
from routing.positions import NodePositions, empty_positions

CHUNK_SIZE = 10_000


def load_road_graph() -> RoadGraph:
    """Load the routing graph straight into the flat arrays it is searched in.

    Nothing per-edge is ever built in Python: the row stream is written into
    arrays that are already the right size, which is why this holds a fraction
    of the memory an object per edge would.
    """
    node_ids = load_node_ids()
    node_count = len(node_ids)
    index_of = {node_id: index for index, node_id in enumerate(node_ids)}

    offsets = load_out_edge_offsets(index_of, node_count)
    edge_count = offsets[node_count]

    sources = array("i", [0]) * edge_count
    targets = array("i", [0]) * edge_count
    costs = array("d", [0.0]) * edge_count
    edge_ids = array("q", [0]) * edge_count
    way_ids = array("q", [0]) * edge_count

    # The next free slot in each node's run, so rows can arrive in any order.
    next_slot = array("i", offsets[:node_count])

    sql = """
        SELECT source_node_id, target_node_id, id, cost_seconds, osm_way_id
        FROM road_edges
    """

    with connection.chunked_cursor() as cursor:
        cursor.execute(sql)

        while rows := cursor.fetchmany(CHUNK_SIZE):
            for source_node_id, target_node_id, edge_id, cost, way_id in rows:
                source = index_of[source_node_id]
                slot = next_slot[source]

                sources[slot] = source
                targets[slot] = index_of[target_node_id]
                costs[slot] = cost
                edge_ids[slot] = edge_id
                way_ids[slot] = NO_WAY_ID if way_id is None else way_id

                next_slot[source] = slot + 1

    return RoadGraph(
        index_of=index_of,
        node_ids=node_ids,
        offsets=offsets,
        sources=sources,
        targets=targets,
        costs=costs,
        edge_ids=edge_ids,
        way_ids=way_ids,
    )


def load_node_ids() -> array:
    """Return every node id, sorted, which fixes the graph's index order."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM road_nodes")
        node_count = cursor.fetchone()[0]

    node_ids = array("q", [0]) * node_count
    index = 0

    with connection.chunked_cursor() as cursor:
        cursor.execute("SELECT osm_id FROM road_nodes ORDER BY osm_id")

        while rows := cursor.fetchmany(CHUNK_SIZE):
            for (osm_id,) in rows:
                if index < node_count:
                    node_ids[index] = osm_id
                else:
                    node_ids.append(osm_id)

                index += 1

    # Trailing zeroes would claim to be nodes, so anything the count
    # over-allocated has to go.
    del node_ids[index:]

    return node_ids


def load_out_edge_offsets(index_of: dict[int, int], node_count: int) -> array:
    """Return where each node's run of outgoing edges starts.

    Counting first means the edge arrays can be allocated once at their final
    size, and each row then goes straight to its slot.
    """
    offsets = array("i", [0]) * (node_count + 1)

    sql = """
        SELECT source_node_id, count(*)
        FROM road_edges
        GROUP BY source_node_id
    """

    with connection.chunked_cursor() as cursor:
        cursor.execute(sql)

        while rows := cursor.fetchmany(CHUNK_SIZE):
            for source_node_id, out_degree in rows:
                offsets[index_of[source_node_id] + 1] = out_degree

    total = 0

    for index in range(1, node_count + 1):
        total += offsets[index]
        offsets[index] = total

    return offsets


def load_node_positions(graph: RoadGraph) -> NodePositions:
    """Load node positions in the graph's index order."""
    positions = empty_positions(graph.node_count)
    index_of = graph.index_of
    x = positions.x
    y = positions.y
    z = positions.z

    sql = "SELECT osm_id, ST_X(location), ST_Y(location) FROM road_nodes"

    with connection.chunked_cursor() as cursor:
        cursor.execute(sql)

        while rows := cursor.fetchmany(CHUNK_SIZE):
            for osm_id, longitude, latitude in rows:
                index = index_of.get(osm_id)

                # The graph indexes the same node table, so this only guards
                # against a node appearing between the two queries.
                if index is None:
                    continue

                x[index], y[index], z[index] = earth_centred_position(
                    longitude, latitude
                )

    return positions


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
