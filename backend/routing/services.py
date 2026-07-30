import json
from dataclasses import dataclass
from functools import lru_cache

from django.db import connection

from routing.dijkstra import RouteEnd, shortest_route
from routing.graph import RoadGraph
from routing.heuristics import build_travel_time_heuristic
from routing.instructions import RouteSegment, RouteStep, build_route_steps
from routing.loaders import (
    load_node_positions,
    load_road_graph,
    load_top_speed_meters_per_second,
)
from routing.models import RoadEdge
from routing.positions import NodePositions
from routing.snapping import SnappedEdge, nearest_edge
from routing.turns import TurnRules, load_turn_rules_from_database

# A route's first and last hops cover part of an edge, so they are not any of the
# edges in the database. Negative ids name them, which is also how
# `build_route_geometry` tells them apart from real ones.
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
    steps: tuple[RouteStep, ...]


@dataclass(frozen=True, slots=True)
class VirtualRouteEdge:
    coordinates: list[list[float]]
    length_meters: float
    cost_seconds: float
    metadata_edge_id: int


@dataclass(frozen=True, slots=True)
class RouteEnds:
    """How a request's two snapped points attach to the graph.

    `virtual_edges` holds the geometry of every part-edge hop named here, keyed
    by the id the hop is reported under.
    """

    starts: tuple[RouteEnd, ...]
    finishes: tuple[RouteEnd, ...]
    virtual_edges: dict[int, VirtualRouteEdge]
    direct_edge_id: int | None


@lru_cache(maxsize=1)
def get_graph() -> RoadGraph:
    return load_road_graph()


@lru_cache(maxsize=1)
def get_turn_rules() -> TurnRules:
    return load_turn_rules_from_database()


@lru_cache(maxsize=1)
def get_node_positions() -> NodePositions:
    # Indexed by the graph's node order, so it is only valid for that graph.
    return load_node_positions(get_graph())


@lru_cache(maxsize=1)
def get_top_speed_meters_per_second() -> float:
    return load_top_speed_meters_per_second()


def calculate_route(
    origin_longitude: float,
    origin_latitude: float,
    destination_longitude: float,
    destination_latitude: float,
) -> RouteResult:
    origin = nearest_edge(origin_longitude, origin_latitude)
    destination = nearest_edge(destination_longitude, destination_latitude)

    ends = build_route_ends(origin, destination)
    virtual_route_edges = ends.virtual_edges

    # Aim the search at the snapped destination rather than the requested point,
    # since the snapped point is where the route actually has to end.
    heuristic = build_travel_time_heuristic(
        get_node_positions(),
        get_top_speed_meters_per_second(),
        destination.longitude,
        destination.latitude,
    )

    path = shortest_route(
        get_graph(),
        ends.starts,
        ends.finishes,
        turn_rules=get_turn_rules(),
        heuristic=heuristic,
    )

    direct_edge_id = ends.direct_edge_id
    direct = None if direct_edge_id is None else virtual_route_edges[direct_edge_id]

    if direct is not None and (path is None or direct.cost_seconds <= path.total_cost):
        # Both points on one stretch of road: the route never reaches a node.
        node_ids: tuple[int, ...] = ()
        edge_ids = (direct_edge_id,)
        duration_seconds = direct.cost_seconds
    elif path is not None:
        node_ids = path.nodes
        edge_ids = path.edge_ids
        duration_seconds = path.total_cost
    else:
        raise ValueError("No route exists between these locations")

    coordinates, distance = build_route_geometry(edge_ids, virtual_route_edges)

    if len(coordinates) < 2:
        coordinates = [
            [origin.longitude, origin.latitude],
            [destination.longitude, destination.latitude],
        ]

    segments = build_route_segments(edge_ids, virtual_route_edges)
    steps = build_route_steps(segments)

    return RouteResult(
        origin=origin,
        destination=destination,
        node_ids=node_ids,
        edge_ids=edge_ids,
        distance_meters=distance,
        duration_seconds=duration_seconds,
        geometry={
            "type": "LineString",
            "coordinates": coordinates,
        },
        steps=steps,
    )


def build_route_ends(origin: SnappedEdge, destination: SnappedEdge) -> RouteEnds:
    origin_has_reverse = has_reverse_edge(origin)

    starts, virtual_edges = build_starts(origin, origin_has_reverse)
    finishes, finish_edges = build_finishes(destination, has_reverse_edge(destination))
    virtual_edges.update(finish_edges)

    direct_edge_id, direct_edge = build_direct_hop(
        origin,
        destination,
        origin_has_reverse,
    )

    if direct_edge is not None:
        virtual_edges[direct_edge_id] = direct_edge

    return RouteEnds(
        starts=starts,
        finishes=finishes,
        virtual_edges=virtual_edges,
        direct_edge_id=direct_edge_id,
    )


def build_starts(
    origin: SnappedEdge,
    has_reverse: bool,
) -> tuple[tuple[RouteEnd, ...], dict[int, VirtualRouteEdge]]:
    """Where a route leaving the origin can join the graph.

    Leaving the snapped point means covering the rest of its edge to reach that
    edge's far node. Where the same road also exists in the other direction, the
    point can instead double back to the near node.
    """
    remaining = 1 - origin.physical_fraction

    starts = [
        RouteEnd(
            node_id=origin.target_node_id,
            cost=origin.cost_seconds * remaining,
            edge_id=ORIGIN_TO_TARGET_EDGE_ID,
            way_id=origin.osm_way_id,
            far_node_id=origin.source_node_id,
        )
    ]

    virtual_edges = {
        ORIGIN_TO_TARGET_EDGE_ID: VirtualRouteEdge(
            coordinates=edge_substring(origin.edge_id, origin.fraction, 1),
            length_meters=origin.length_meters * remaining,
            cost_seconds=origin.cost_seconds * remaining,
            metadata_edge_id=origin.edge_id,
        ),
    }

    if has_reverse:
        starts.append(
            RouteEnd(
                node_id=origin.source_node_id,
                cost=origin.cost_seconds * origin.physical_fraction,
                edge_id=ORIGIN_TO_SOURCE_EDGE_ID,
                way_id=origin.osm_way_id,
                far_node_id=origin.target_node_id,
            )
        )

        virtual_edges[ORIGIN_TO_SOURCE_EDGE_ID] = VirtualRouteEdge(
            coordinates=list(
                reversed(edge_substring(origin.edge_id, 0, origin.fraction))
            ),
            length_meters=origin.length_meters * origin.physical_fraction,
            cost_seconds=origin.cost_seconds * origin.physical_fraction,
            metadata_edge_id=origin.edge_id,
        )

    return tuple(starts), virtual_edges


def build_finishes(
    destination: SnappedEdge,
    has_reverse: bool,
) -> tuple[tuple[RouteEnd, ...], dict[int, VirtualRouteEdge]]:
    """Which graph nodes a route can reach the destination from.

    The mirror of `build_starts`: the near node of the destination's edge always
    reaches it, and the far node does too where the road runs both ways.
    """
    covered = destination.physical_fraction

    finishes = [
        RouteEnd(
            node_id=destination.source_node_id,
            cost=destination.cost_seconds * covered,
            edge_id=SOURCE_TO_DESTINATION_EDGE_ID,
            way_id=destination.osm_way_id,
            far_node_id=destination.target_node_id,
        )
    ]

    virtual_edges = {
        SOURCE_TO_DESTINATION_EDGE_ID: VirtualRouteEdge(
            coordinates=edge_substring(destination.edge_id, 0, destination.fraction),
            length_meters=destination.length_meters * covered,
            cost_seconds=destination.cost_seconds * covered,
            metadata_edge_id=destination.edge_id,
        ),
    }

    if has_reverse:
        finishes.append(
            RouteEnd(
                node_id=destination.target_node_id,
                cost=destination.cost_seconds * (1 - covered),
                edge_id=TARGET_TO_DESTINATION_EDGE_ID,
                way_id=destination.osm_way_id,
                far_node_id=destination.source_node_id,
            )
        )

        virtual_edges[TARGET_TO_DESTINATION_EDGE_ID] = VirtualRouteEdge(
            coordinates=list(
                reversed(edge_substring(destination.edge_id, destination.fraction, 1))
            ),
            length_meters=destination.length_meters * (1 - covered),
            cost_seconds=destination.cost_seconds * (1 - covered),
            metadata_edge_id=destination.edge_id,
        )

    return tuple(finishes), virtual_edges


def build_direct_hop(
    origin: SnappedEdge,
    destination: SnappedEdge,
    origin_has_reverse: bool,
) -> tuple[int | None, VirtualRouteEdge | None]:
    """The hop straight from origin to destination along one stretch of road.

    Such a route reaches no graph node, so the search cannot find it. It is
    offered alongside whatever the search does find.
    """
    if not same_physical_segment(origin, destination):
        return None, None

    destination_fraction = destination.fraction
    destination_physical = destination.physical_fraction

    # One physical segment can be stored as two opposite directed rows, so
    # measure the destination in the origin's direction before comparing.
    if origin.edge_id != destination.edge_id:
        destination_fraction = 1 - destination_fraction
        destination_physical = 1 - destination_physical

    # Ordering is the same in either measure, so the cheaper degree fraction
    # decides direction while the physical one sizes the hop.
    if origin.fraction <= destination_fraction:
        edge_id = DIRECT_FORWARD_EDGE_ID
        physical_span = destination_physical - origin.physical_fraction
        coordinates = edge_substring(
            origin.edge_id,
            origin.fraction,
            destination_fraction,
        )
    elif origin_has_reverse:
        edge_id = DIRECT_REVERSE_EDGE_ID
        physical_span = origin.physical_fraction - destination_physical
        coordinates = list(
            reversed(
                edge_substring(origin.edge_id, destination_fraction, origin.fraction)
            )
        )
    else:
        return None, None

    return edge_id, VirtualRouteEdge(
        coordinates=coordinates,
        length_meters=origin.length_meters * physical_span,
        cost_seconds=origin.cost_seconds * physical_span,
        metadata_edge_id=origin.edge_id,
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


def build_route_segments(
    edge_ids: tuple[int, ...],
    virtual_route_edges: dict[int, VirtualRouteEdge],
) -> list[RouteSegment]:
    real_edge_ids = [edge_id for edge_id in edge_ids if edge_id > 0]
    metadata_edge_ids = [
        virtual_route_edges[edge_id].metadata_edge_id
        for edge_id in edge_ids
        if edge_id < 0
    ]

    edges = RoadEdge.objects.filter(id__in=[*real_edge_ids, *metadata_edge_ids]).only(
        "id",
        "osm_way_id",
        "name",
        "road_class",
        "geometry",
        "length_meters",
        "cost_seconds",
    )
    edges_by_id = {edge.id: edge for edge in edges}

    segments: list[RouteSegment] = []

    for edge_id in edge_ids:
        if edge_id < 0:
            route_edge = virtual_route_edges[edge_id]
            metadata_edge = edges_by_id.get(route_edge.metadata_edge_id)

            if metadata_edge is None:
                raise RuntimeError(f"Missing route edge: {route_edge.metadata_edge_id}")

            coordinates = route_edge.coordinates
            distance_meters = route_edge.length_meters
            duration_seconds = route_edge.cost_seconds
            osm_way_id = metadata_edge.osm_way_id
            road_name = metadata_edge.name
            road_class = metadata_edge.road_class
        else:
            edge = edges_by_id.get(edge_id)

            if edge is None:
                raise RuntimeError(f"Missing route edge: {edge_id}")

            coordinates = [
                [longitude, latitude] for longitude, latitude in edge.geometry.coords
            ]
            distance_meters = edge.length_meters
            duration_seconds = edge.cost_seconds
            osm_way_id = edge.osm_way_id
            road_name = edge.name
            road_class = edge.road_class

        if distance_meters <= 0 or len(coordinates) < 2:
            continue

        segments.append(
            RouteSegment(
                edge_id=edge_id,
                osm_way_id=osm_way_id,
                road_name=road_name,
                road_class=road_class,
                distance_meters=distance_meters,
                duration_seconds=duration_seconds,
                coordinates=coordinates,
            )
        )

    return segments


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
