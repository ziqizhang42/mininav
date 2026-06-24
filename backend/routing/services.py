from dataclasses import dataclass
from functools import lru_cache

from routing.dijkstra import shortest_path
from routing.graph import Graph
from routing.loaders import load_graph_from_database
from routing.models import RoadEdge
from routing.snapping import SnappedNode, nearest_node


@dataclass(frozen=True, slots=True)
class RouteResult:
    origin: SnappedNode
    destination: SnappedNode
    node_ids: tuple[int, ...]
    edge_ids: tuple[int, ...]
    distance_meters: float
    duration_seconds: float
    geometry: dict[str, object]


@lru_cache(maxsize=1)
def get_graph() -> Graph:
    return load_graph_from_database()


def calculate_route(
    origin_longitude: float,
    origin_latitude: float,
    destination_longitude: float,
    destination_latitude: float,
) -> RouteResult:
    origin = nearest_node(origin_longitude, origin_latitude)
    destination = nearest_node(destination_longitude, destination_latitude)

    path = shortest_path(get_graph(), origin.node_id, destination.node_id)

    if path is None:
        raise ValueError("No route exists between these locations")

    edges = RoadEdge.objects.filter(id__in=path.edge_ids).only(
        "id", "geometry", "length_meters"
    )

    edges_by_id = {edge.id: edge for edge in edges}

    coordinates: list[list[float]] = []
    distance = 0.0

    for edge_id in path.edge_ids:
        edge = edges_by_id.get(edge_id)

        if edge is None:
            raise RuntimeError(f"Missing route edge: {edge_id}")

        edge_coordinates = [
            [longitude, latitude] for longitude, latitude in edge.geometry.coords
        ]

        if not coordinates:
            coordinates.extend(edge_coordinates)
        elif coordinates[-1] == edge_coordinates[0]:
            coordinates.extend(edge_coordinates[1:])
        else:
            raise RuntimeError(f"Disconnected edge geometry: {edge_id}")

        distance += edge.length_meters

    if not coordinates:
        coordinates = [
            [origin.longitude, origin.latitude],
            [destination.longitude, destination.latitude],
        ]

    return RouteResult(
        origin=origin,
        destination=destination,
        node_ids=path.nodes,
        edge_ids=path.edge_ids,
        distance_meters=distance,
        duration_seconds=path.total_cost,
        geometry={
            "type": "LineString",
            "coordinates": coordinates,
        },
    )
