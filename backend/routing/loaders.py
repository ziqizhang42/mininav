from routing.graph import Edge, Graph
from routing.models import RoadEdge


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
