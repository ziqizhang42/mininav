from routing.dijkstra import (
    Path,
    RouteEnd,
    shortest_distance,
    shortest_path,
    shortest_route,
)
from routing.geo import earth_centred_position
from routing.graph import Adjacency, Edge, RoadGraph, compile_graph, tiny_graph
from routing.heuristics import build_travel_time_heuristic
from routing.positions import empty_positions
from routing.turns import TurnRules


def positions_for(
    graph: RoadGraph,
    coordinates: dict[int, tuple[float, float]],
):
    """Build positions in the graph's internal node-index order."""
    positions = empty_positions(graph.node_count)

    for node_id, (longitude, latitude) in coordinates.items():
        index = graph.index_of[node_id]
        (
            positions.x[index],
            positions.y[index],
            positions.z[index],
        ) = earth_centred_position(longitude, latitude)

    return positions


BLOCKED_TURN_ADJACENCY: Adjacency = {
    1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
    2: [
        Edge(id=2, source=2, target=3, cost=1, osm_way_id=20),
        Edge(id=3, source=2, target=4, cost=5, osm_way_id=30),
    ],
    3: [Edge(id=4, source=3, target=4, cost=1, osm_way_id=40)],
    4: [],
}


def test_finds_shortest_distance() -> None:
    result = shortest_distance(tiny_graph, start=1, end=4)

    assert result == 6


def test_finds_shortest_path() -> None:
    result = shortest_path(tiny_graph, start=1, end=4)

    assert result == Path(nodes=(1, 3, 2, 4), edge_ids=(2, 4, 3), total_cost=6)


def test_start_and_end_can_be_the_same_node() -> None:
    result = shortest_path(tiny_graph, start=1, end=1)

    assert result == Path(nodes=(1,), edge_ids=(), total_cost=0)


def test_returns_none_when_no_route_exists() -> None:
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=5)],
            2: [],
            3: [],
        }
    )

    result = shortest_path(graph, start=1, end=3)

    assert result is None


def test_returns_none_for_a_node_the_graph_does_not_have() -> None:
    result = shortest_path(tiny_graph, start=1, end=99)

    assert result is None


def test_does_not_travel_backwards_on_a_one_way_edge() -> None:
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=5)],
            2: [],
        }
    )

    result = shortest_path(graph, start=2, end=1)

    assert result is None


def test_counts_the_hop_a_route_starts_on() -> None:
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=5)],
            2: [],
        }
    )

    result = shortest_route(
        graph,
        starts=(RouteEnd(node_id=1, cost=2, edge_id=-1),),
        finishes=(RouteEnd(node_id=2),),
    )

    assert result == Path(nodes=(1, 2), edge_ids=(-1, 1), total_cost=7)


def test_a_route_may_start_and_finish_between_nodes() -> None:
    """Include partial-edge costs and IDs at both ends of the route."""
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=5)],
            2: [],
        }
    )

    result = shortest_route(
        graph,
        starts=(RouteEnd(node_id=1, cost=2, edge_id=-1),),
        finishes=(RouteEnd(node_id=2, cost=3, edge_id=-2),),
    )

    assert result == Path(nodes=(1, 2), edge_ids=(-1, 1, -2), total_cost=10)


def test_takes_the_cheapest_of_several_finishes() -> None:
    graph = compile_graph(
        {
            1: [
                Edge(id=1, source=1, target=2, cost=5),
                Edge(id=2, source=1, target=3, cost=1),
            ],
            2: [],
            3: [],
        }
    )

    # Via node 2 costs 5 + 1 = 6; via node 3 costs 1 + 20 = 21.
    result = shortest_route(
        graph,
        starts=(RouteEnd(node_id=1),),
        finishes=(
            RouteEnd(node_id=2, cost=1, edge_id=-1),
            RouteEnd(node_id=3, cost=20, edge_id=-2),
        ),
    )

    assert result == Path(nodes=(1, 2), edge_ids=(1, -1), total_cost=6)


def test_avoids_blocked_turn_restriction() -> None:
    graph = compile_graph(BLOCKED_TURN_ADJACENCY)
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )

    result = shortest_path(graph, start=1, end=4, turn_rules=rules)

    assert result == Path(nodes=(1, 2, 4), edge_ids=(1, 3), total_cost=6)


def test_allows_unblocked_shorter_turn() -> None:
    graph = compile_graph(BLOCKED_TURN_ADJACENCY)

    result = shortest_path(graph, start=1, end=4)

    assert result == Path(nodes=(1, 2, 3, 4), edge_ids=(1, 2, 4), total_cost=3)


def test_admissible_heuristic_keeps_the_cheapest_path() -> None:
    # These coordinates keep every estimate at or below the actual cheapest
    # remaining cost: 6 from node 1, 1 from node 2, and 4 from node 3.
    positions = positions_for(
        tiny_graph,
        {
            1: (-114.00, 51.00135),
            2: (-114.00, 51.00018),
            3: (-114.00, 51.00090),
            4: (-114.00, 51.00000),
        },
    )
    heuristic = build_travel_time_heuristic(positions, 30.0, -114.00, 51.00000)

    # Confirm the heuristic is active instead of reducing A* to Dijkstra's algorithm.
    assert heuristic(tiny_graph.index_of[1]) > 0

    result = shortest_path(tiny_graph, start=1, end=4, heuristic=heuristic)

    assert result == shortest_path(tiny_graph, start=1, end=4)
    assert result == Path(nodes=(1, 3, 2, 4), edge_ids=(2, 4, 3), total_cost=6)


def test_heuristic_ignores_nodes_without_a_location() -> None:
    heuristic = build_travel_time_heuristic(empty_positions(0), 30.0, -114.00, 51.04)

    result = shortest_path(tiny_graph, start=1, end=4, heuristic=heuristic)

    assert result == Path(nodes=(1, 3, 2, 4), edge_ids=(2, 4, 3), total_cost=6)


def test_heuristic_still_obeys_turn_restrictions() -> None:
    graph = compile_graph(BLOCKED_TURN_ADJACENCY)
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )
    # Each estimate is at or below the cheapest remaining cost before applying
    # turn restrictions: 3 from node 1, 2 from node 2, and 1 from node 3.
    positions = positions_for(
        graph,
        {
            1: (-114.00, 51.00054),
            2: (-114.00, 51.00036),
            3: (-114.00, 51.00018),
            4: (-114.00, 51.00000),
        },
    )
    heuristic = build_travel_time_heuristic(positions, 30.0, -114.00, 51.00000)

    assert heuristic(graph.index_of[1]) > 0

    result = shortest_path(graph, start=1, end=4, turn_rules=rules, heuristic=heuristic)

    assert result == Path(nodes=(1, 2, 4), edge_ids=(1, 3), total_cost=6)


def test_obeys_only_turn_restriction() -> None:
    graph = compile_graph(BLOCKED_TURN_ADJACENCY)
    rules = TurnRules(
        blocked={},
        only_allowed={(10, 2): frozenset({30})},
    )

    result = shortest_path(graph, start=1, end=4, turn_rules=rules)

    assert result == Path(nodes=(1, 2, 4), edge_ids=(1, 3), total_cost=6)


def test_a_turn_rule_does_not_block_the_way_it_names_elsewhere() -> None:
    """The same pair of way IDs remains allowed at a different via node."""
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
            2: [Edge(id=2, source=2, target=3, cost=1, osm_way_id=20)],
            3: [],
        }
    )
    rules = TurnRules(
        blocked={(10, 99, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )

    result = shortest_path(graph, start=1, end=3, turn_rules=rules)

    assert result == Path(nodes=(1, 2, 3), edge_ids=(1, 2), total_cost=2)


def test_a_turn_rule_applies_to_the_road_a_route_started_on() -> None:
    """The starting partial edge provides the incoming way for turn checks."""
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
            2: [
                Edge(id=2, source=2, target=3, cost=1, osm_way_id=20),
                Edge(id=3, source=2, target=3, cost=5, osm_way_id=30),
            ],
            3: [],
        }
    )
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_left_turn"})},
        only_allowed={},
    )

    # The start is partway along edge 1, so it arrives at node 2 on way 10.
    result = shortest_route(
        graph,
        starts=(RouteEnd(node_id=2, cost=0.5, edge_id=-1, way_id=10, far_node_id=1),),
        finishes=(RouteEnd(node_id=3),),
        turn_rules=rules,
    )

    # Way 20 (cost 1) is blocked, so the route takes way 30 (cost 5).
    assert result == Path(nodes=(2, 3), edge_ids=(-1, 3), total_cost=5.5)


def test_a_turn_rule_applies_to_the_road_a_route_finishes_on() -> None:
    """The finishing partial edge provides the outgoing way for turn checks."""
    graph = compile_graph(
        {
            1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
            2: [],
        }
    )
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_left_turn"})},
        only_allowed={},
    )

    result = shortest_route(
        graph,
        starts=(RouteEnd(node_id=1),),
        finishes=(
            RouteEnd(node_id=2, cost=1, edge_id=-1, way_id=20, far_node_id=3),
            RouteEnd(node_id=2, cost=5, edge_id=-2, way_id=40, far_node_id=3),
        ),
        turn_rules=rules,
    )

    # Finishing on way 20 (cost 1) is blocked, so the route uses way 40 (cost 5).
    assert result == Path(nodes=(1, 2), edge_ids=(1, -2), total_cost=6)
