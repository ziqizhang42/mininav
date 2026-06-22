from routing.dijkstra import Path, shortest_distance, shortest_path
from routing.graph import Edge, tiny_graph


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
