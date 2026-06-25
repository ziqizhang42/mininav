import json
from dataclasses import dataclass
from functools import lru_cache

from django.db import connection

from routing.dijkstra import shortest_path
from routing.graph import Edge, Graph
from routing.loaders import load_graph_from_database
from routing.models import RoadEdge
from routing.snapping import SnappedEdge, nearest_edge

# Negative IDs are synthetic route-only graph elements (never stored in the DB)
# or small negative nodes IDs are for testing
ORIGIN_NODE_ID = -9_000_000_000_000_001
DESTINATION_NODE_ID = -9_000_000_000_000_002

ORIGIN_TO_TARGET_EDGE_ID = -1
ORIGIN_TO_SOURCE_EDGE_ID = -2
SOURCE_TO_DESTINATION_EDGE_ID = -3
TARGET_TO_DESTINATION_EDGE_ID = -4
DIRECT_FORWARD_EDGE_ID = -5
DIRECT_REVERSE_EDGE_ID = -6


@dataclass(frozen=True, slots=True)
class RouteResult:
    origin: SnappedEdge
    destination: SnappedEdge
    node_ids: tuple[int, ...]
    edge_ids: tuple[int, ...]
    distance_meters: float
    duration_seconds: float
    geometry: dict[str, object]


@dataclass(frozen=True, slots=True)
class VirtualRouteEdge:
    coordinates: list[list[float]]
    length_meters: float


@lru_cache(maxsize=1)
def get_graph() -> Graph:
    return load_graph_from_database()


def calculate_route(
    origin_longitude: float,
    origin_latitude: float,
    destination_longitude: float,
    destination_latitude: float,
) -> RouteResult:
    origin = nearest_edge(origin_longitude, origin_latitude)
    destination = nearest_edge(destination_longitude, destination_latitude)

    extra_edges, virtual_route_edges = build_virtual_edges(origin, destination)

    path = shortest_path(
        get_graph(),
        ORIGIN_NODE_ID,
        DESTINATION_NODE_ID,
        extra_edges=extra_edges,
    )

    if path is None:
        raise ValueError("No route exists between these locations")

    coordinates, distance = build_route_geometry(path.edge_ids, virtual_route_edges)

    if len(coordinates) < 2:
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


def build_virtual_edges(
    origin: SnappedEdge,
    destination: SnappedEdge,
) -> tuple[dict[int, tuple[Edge, ...]], dict[int, VirtualRouteEdge]]:
    origin_has_reverse = has_reverse_edge(origin)
    destination_has_reverse = has_reverse_edge(destination)

    origin_edges, virtual_route_edges = build_origin_connector_edges(
        origin,
        origin_has_reverse,
    )

    destination_edges, destination_virtual_edges = build_destination_connector_edges(
        destination,
        destination_has_reverse,
    )
    virtual_route_edges.update(destination_virtual_edges)

    extra_edges: dict[int, tuple[Edge, ...]] = {
        ORIGIN_NODE_ID: origin_edges,
    }

    add_extra_edges_by_source(extra_edges, destination_edges)

    add_direct_edges(
        extra_edges,
        virtual_route_edges,
        origin,
        destination,
        origin_has_reverse,
    )

    return extra_edges, virtual_route_edges


def build_origin_connector_edges(
    origin: SnappedEdge,
    has_reverse: bool,
) -> tuple[tuple[Edge, ...], dict[int, VirtualRouteEdge]]:
    edges = [
        Edge(
            id=ORIGIN_TO_TARGET_EDGE_ID,
            source=ORIGIN_NODE_ID,
            target=origin.target_node_id,
            cost=origin.cost_seconds * (1 - origin.fraction),
        )
    ]

    virtual_edges = {
        ORIGIN_TO_TARGET_EDGE_ID: VirtualRouteEdge(
            coordinates=edge_substring(origin.edge_id, origin.fraction, 1),
            length_meters=origin.length_meters * (1 - origin.fraction),
        ),
    }

    # A reverse edge means this snapped point can leave the physical segment
    # toward either endpoint
    if has_reverse:
        edges.append(
            Edge(
                id=ORIGIN_TO_SOURCE_EDGE_ID,
                source=ORIGIN_NODE_ID,
                target=origin.source_node_id,
                cost=origin.cost_seconds * origin.fraction,
            )
        )

        virtual_edges[ORIGIN_TO_SOURCE_EDGE_ID] = VirtualRouteEdge(
            coordinates=list(
                reversed(edge_substring(origin.edge_id, 0, origin.fraction))
            ),
            length_meters=origin.length_meters * origin.fraction,
        )

    return tuple(edges), virtual_edges


def build_destination_connector_edges(
    destination: SnappedEdge,
    has_reverse: bool,
) -> tuple[tuple[Edge, ...], dict[int, VirtualRouteEdge]]:
    edges = [
        Edge(
            id=SOURCE_TO_DESTINATION_EDGE_ID,
            source=destination.source_node_id,
            target=DESTINATION_NODE_ID,
            cost=destination.cost_seconds * destination.fraction,
        )
    ]

    virtual_edges = {
        SOURCE_TO_DESTINATION_EDGE_ID: VirtualRouteEdge(
            coordinates=edge_substring(destination.edge_id, 0, destination.fraction),
            length_meters=destination.length_meters * destination.fraction,
        ),
    }

    # A reverse edge means the destination can be reached from either
    # endpoint of the segment
    if has_reverse:
        edges.append(
            Edge(
                id=TARGET_TO_DESTINATION_EDGE_ID,
                source=destination.target_node_id,
                target=DESTINATION_NODE_ID,
                cost=destination.cost_seconds * (1 - destination.fraction),
            )
        )

        virtual_edges[TARGET_TO_DESTINATION_EDGE_ID] = VirtualRouteEdge(
            coordinates=list(
                reversed(edge_substring(destination.edge_id, destination.fraction, 1))
            ),
            length_meters=destination.length_meters * (1 - destination.fraction),
        )

    return tuple(edges), virtual_edges


def add_extra_edges_by_source(
    extra_edges: dict[int, tuple[Edge, ...]],
    edges: tuple[Edge, ...],
) -> None:
    for edge in edges:
        extra_edges[edge.source] = (*extra_edges.get(edge.source, ()), edge)


def add_direct_edges(
    extra_edges: dict[int, tuple[Edge, ...]],
    virtual_route_edges: dict[int, VirtualRouteEdge],
    origin: SnappedEdge,
    destination: SnappedEdge,
    origin_has_reverse: bool,
) -> None:
    destination_fraction_on_origin = destination.fraction
    same_segment = same_physical_segment(origin, destination)

    # Same physical segment can be represented by opposite directed rows
    # compare fractions in origin's direction
    if origin.edge_id != destination.edge_id and same_segment:
        destination_fraction_on_origin = 1 - destination.fraction

    if same_segment and origin.fraction <= destination_fraction_on_origin:
        direct_cost = origin.cost_seconds * (
            destination_fraction_on_origin - origin.fraction
        )

        extra_edges[ORIGIN_NODE_ID] = (
            *extra_edges[ORIGIN_NODE_ID],
            Edge(
                id=DIRECT_FORWARD_EDGE_ID,
                source=ORIGIN_NODE_ID,
                target=DESTINATION_NODE_ID,
                cost=direct_cost,
            ),
        )

        virtual_route_edges[DIRECT_FORWARD_EDGE_ID] = VirtualRouteEdge(
            coordinates=edge_substring(
                origin.edge_id,
                origin.fraction,
                destination_fraction_on_origin,
            ),
            length_meters=origin.length_meters
            * (destination_fraction_on_origin - origin.fraction),
        )

    if (
        same_segment
        and origin.fraction > destination_fraction_on_origin
        and origin_has_reverse
    ):
        direct_cost = origin.cost_seconds * (
            origin.fraction - destination_fraction_on_origin
        )

        extra_edges[ORIGIN_NODE_ID] = (
            *extra_edges[ORIGIN_NODE_ID],
            Edge(
                id=DIRECT_REVERSE_EDGE_ID,
                source=ORIGIN_NODE_ID,
                target=DESTINATION_NODE_ID,
                cost=direct_cost,
            ),
        )

        virtual_route_edges[DIRECT_REVERSE_EDGE_ID] = VirtualRouteEdge(
            coordinates=list(
                reversed(
                    edge_substring(
                        origin.edge_id,
                        destination_fraction_on_origin,
                        origin.fraction,
                    )
                )
            ),
            length_meters=origin.length_meters
            * (origin.fraction - destination_fraction_on_origin),
        )


def build_route_geometry(
    edge_ids: tuple[int, ...],
    virtual_route_edges: dict[int, VirtualRouteEdge],
) -> tuple[list[list[float]], float]:
    real_edge_ids = [edge_id for edge_id in edge_ids if edge_id > 0]

    edges = RoadEdge.objects.filter(id__in=real_edge_ids).only(
        "id", "geometry", "length_meters"
    )
    edges_by_id = {edge.id: edge for edge in edges}

    coordinates: list[list[float]] = []
    distance = 0.0

    for edge_id in edge_ids:
        if edge_id < 0:
            route_edge = virtual_route_edges[edge_id]
            edge_coordinates = route_edge.coordinates
            distance += route_edge.length_meters
        else:
            edge = edges_by_id.get(edge_id)

            if edge is None:
                raise RuntimeError(f"Missing route edge: {edge_id}")

            edge_coordinates = [
                [longitude, latitude] for longitude, latitude in edge.geometry.coords
            ]
            distance += edge.length_meters

        append_edge_coordinates(coordinates, edge_coordinates, edge_id)

    return coordinates, distance


def append_edge_coordinates(
    coordinates: list[list[float]],
    edge_coordinates: list[list[float]],
    edge_id: int,
) -> None:
    if not edge_coordinates:
        return

    if not coordinates:
        coordinates.extend(edge_coordinates)
    elif coordinates[-1] == edge_coordinates[0]:
        coordinates.extend(edge_coordinates[1:])
    else:
        raise RuntimeError(f"Disconnected edge geometry: {edge_id}")


def edge_substring(
    edge_id: int,
    start_fraction: float,
    end_fraction: float,
) -> list[list[float]]:
    sql = """
        SELECT ST_AsGeoJSON(ST_LineSubstring(geometry, %s, %s))
        FROM road_edges
        WHERE id = %s
    """

    with connection.cursor() as cursor:
        cursor.execute(sql, [start_fraction, end_fraction, edge_id])
        row = cursor.fetchone()

    if row is None:
        raise RuntimeError(f"Missing route edge: {edge_id}")

    geometry = json.loads(row[0])

    if geometry["type"] == "Point":
        longitude, latitude = geometry["coordinates"]
        return [[longitude, latitude]]

    return [[longitude, latitude] for longitude, latitude in geometry["coordinates"]]


def has_reverse_edge(edge: SnappedEdge) -> bool:
    return RoadEdge.objects.filter(
        osm_way_id=edge.osm_way_id,
        segment_index=edge.segment_index,
        source_id=edge.target_node_id,
        target_id=edge.source_node_id,
    ).exists()


def same_physical_segment(a: SnappedEdge, b: SnappedEdge) -> bool:
    return (
        a.osm_way_id == b.osm_way_id
        and a.segment_index == b.segment_index
        and {a.source_node_id, a.target_node_id} == {b.source_node_id, b.target_node_id}
    )
