from routing.dijkstra import Path, shortest_distance, shortest_path
from routing.graph import Edge, tiny_graph
from routing.turns import TurnRules


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
    graph = {
        1: [Edge(id=1, source=1, target=2, cost=5)],
        2: [],
        3: [],
    }

    result = shortest_path(graph, start=1, end=3)

    assert result is None


def test_does_not_travel_backwards_on_a_one_way_edge() -> None:
    graph = {
        1: [Edge(id=1, source=1, target=2, cost=5)],
        2: [],
    }

    result = shortest_path(graph, start=2, end=1)

    assert result is None


def test_finds_path_using_extra_edges() -> None:
    graph = {
        1: [Edge(id=1, source=1, target=2, cost=5)],
        2: [],
        -1: [],
    }

    extra_edges = {-1: (Edge(id=-1, source=-1, target=1, cost=2),)}

    result = shortest_path(graph, start=-1, end=2, extra_edges=extra_edges)

    assert result == Path(nodes=(-1, 1, 2), edge_ids=(-1, 1), total_cost=7)


def test_avoids_blocked_turn_restriction() -> None:
    graph = {
        1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
        2: [
            Edge(id=2, source=2, target=3, cost=1, osm_way_id=20),
            Edge(id=3, source=2, target=4, cost=5, osm_way_id=30),
        ],
        3: [Edge(id=4, source=3, target=4, cost=1, osm_way_id=40)],
        4: [],
    }
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )

    result = shortest_path(graph, start=1, end=4, turn_rules=rules)

    assert result == Path(nodes=(1, 2, 4), edge_ids=(1, 3), total_cost=6)


def test_allows_unblocked_shorter_turn() -> None:
    graph = {
        1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
        2: [
            Edge(id=2, source=2, target=3, cost=1, osm_way_id=20),
            Edge(id=3, source=2, target=4, cost=5, osm_way_id=30),
        ],
        3: [Edge(id=4, source=3, target=4, cost=1, osm_way_id=40)],
        4: [],
    }

    result = shortest_path(graph, start=1, end=4)

    assert result == Path(nodes=(1, 2, 3, 4), edge_ids=(1, 2, 4), total_cost=3)


def test_obeys_only_turn_restriction() -> None:
    graph = {
        1: [Edge(id=1, source=1, target=2, cost=1, osm_way_id=10)],
        2: [
            Edge(id=2, source=2, target=3, cost=1, osm_way_id=20),
            Edge(id=3, source=2, target=4, cost=5, osm_way_id=30),
        ],
        3: [Edge(id=4, source=3, target=4, cost=1, osm_way_id=40)],
        4: [],
    }
    rules = TurnRules(
        blocked={},
        only_allowed={(10, 2): frozenset({30})},
    )

    result = shortest_path(graph, start=1, end=4, turn_rules=rules)

    assert result == Path(nodes=(1, 2, 4), edge_ids=(1, 3), total_cost=6)
