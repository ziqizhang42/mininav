import pytest
from django.contrib.gis.geos import LineString, Point

from routing import services
from routing.dijkstra import shortest_route
from routing.geo import distance_meters
from routing.heuristics import build_travel_time_heuristic
from routing.loaders import (
    load_node_positions,
    load_road_graph,
    load_top_speed_meters_per_second,
)
from routing.models import RoadEdge, RoadNode
from routing.snapping import nearest_edge

# A shared speed keeps the heuristic tight enough to expose connector errors.
SPEED = 31.0

NODES = {
    1: (-114.00, 51.000),
    2: (-114.00, 51.010),
    3: (-113.98, 51.020),
    4: (-114.05, 51.014),
}

# The bend makes its coordinate fraction differ from its physical-distance fraction.
BENT = [(-114.00, 51.010), (-114.00, 51.020), (-113.98, 51.020)]

STRAIGHT_VIA_4 = {
    (1, 4): [(-114.00, 51.000), (-114.05, 51.014)],
    (4, 3): [(-114.05, 51.014), (-113.98, 51.020)],
}


def polyline_length(points):
    return sum(
        distance_meters(a[0], a[1], b[0], b[1]) for a, b in zip(points, points[1:])
    )


def make_edge(edge_id, way_id, source, target, points):
    length = polyline_length(points)

    return RoadEdge(
        id=edge_id,
        osm_way_id=way_id,
        segment_index=0,
        source_id=source,
        target_id=target,
        geometry=LineString(points, srid=4326),
        length_meters=length,
        cost_seconds=length / SPEED,
        road_class="motorway",
        name="Test Road",
        tags={},
    )


@pytest.fixture
def bent_graph(db):
    RoadNode.objects.bulk_create(
        RoadNode(osm_id=osm_id, location=Point(lon, lat, srid=4326))
        for osm_id, (lon, lat) in NODES.items()
    )

    edges = [
        make_edge(1, 10, 1, 2, [NODES[1], NODES[2]]),
        make_edge(2, 20, 2, 1, [NODES[2], NODES[1]]),
        # Both directions exercise connectors from either endpoint.
        make_edge(3, 30, 2, 3, BENT),
        make_edge(4, 30, 3, 2, list(reversed(BENT))),
        make_edge(5, 40, 1, 4, STRAIGHT_VIA_4[(1, 4)]),
        make_edge(6, 40, 4, 1, list(reversed(STRAIGHT_VIA_4[(1, 4)]))),
        make_edge(7, 50, 4, 3, STRAIGHT_VIA_4[(4, 3)]),
        make_edge(8, 50, 3, 4, list(reversed(STRAIGHT_VIA_4[(4, 3)]))),
    ]
    RoadEdge.objects.bulk_create(edges)


def route_costs(origin_lonlat, destination_lonlat):
    """Return the cost A* finds and the cost plain Dijkstra finds."""
    origin = nearest_edge(*origin_lonlat)
    destination = nearest_edge(*destination_lonlat)
    ends = services.build_route_ends(origin, destination)

    graph = load_road_graph()
    heuristic = build_travel_time_heuristic(
        load_node_positions(graph),
        load_top_speed_meters_per_second(),
        destination.longitude,
        destination.latitude,
    )

    with_heuristic = shortest_route(
        graph, ends.starts, ends.finishes, heuristic=heuristic
    )
    without = shortest_route(graph, ends.starts, ends.finishes)

    assert with_heuristic is not None
    assert without is not None

    return with_heuristic.total_cost, without.total_cost


@pytest.mark.parametrize(
    "destination",
    [
        (-114.000, 51.0130),  # part way up the northern leg
        (-114.000, 51.0175),  # near the top of the northern leg
        (-114.000, 51.0200),  # the corner itself
        (-113.9930, 51.020),  # part way along the eastern leg
        (-113.9840, 51.020),  # near the far end of the eastern leg
    ],
)
def test_astar_matches_dijkstra_into_a_bent_edge(bent_graph, destination):
    with_heuristic, without = route_costs((-114.00, 51.000), destination)

    assert with_heuristic == pytest.approx(without, rel=1e-12)


INTERIOR_POINTS = [
    (-114.000, 51.0130),
    (-114.000, 51.0175),
    (-114.000, 51.0200),
    (-113.9930, 51.020),
    (-113.9840, 51.020),
]


@pytest.mark.parametrize("destination", INTERIOR_POINTS)
def test_estimate_never_exceeds_the_finish_hop_it_bounds(bent_graph, destination):
    """The estimate at a finish node must not exceed that node's hop cost."""
    snapped = nearest_edge(*destination)
    finishes, _ = services.build_finishes(
        snapped,
        services.has_reverse_edge(snapped),
    )
    graph = load_road_graph()
    heuristic = build_travel_time_heuristic(
        load_node_positions(graph),
        load_top_speed_meters_per_second(),
        snapped.longitude,
        snapped.latitude,
    )

    assert len(finishes) == 2

    for finish in finishes:
        index = graph.index_of[finish.node_id]

        assert heuristic(index) <= finish.cost + 1e-9


@pytest.mark.parametrize(
    "destination",
    [
        (-114.000, 51.0130),
        (-114.000, 51.0200),
        (-113.9930, 51.020),
    ],
)
def test_astar_matches_dijkstra_approaching_the_far_end(bent_graph, destination):
    # Starting near node 4 exercises the reverse destination connector.
    with_heuristic, without = route_costs((-114.05, 51.014), destination)

    assert with_heuristic == pytest.approx(without, rel=1e-12)


def test_the_bend_really_does_distort_the_degree_fraction(bent_graph):
    """Confirm that the fixture produces meaningfully different fractions."""
    snapped = nearest_edge(-114.000, 51.0200)

    # Either directed edge may be selected.
    assert snapped.fraction == pytest.approx(1 / 3, rel=1e-3) or (
        snapped.fraction == pytest.approx(2 / 3, rel=1e-3)
    )

    assert abs(snapped.physical_fraction - snapped.fraction) > 0.05
