import heapq
from collections.abc import Mapping
from dataclasses import dataclass

from routing.graph import Edge, Graph


@dataclass(frozen=True, slots=True)
class Path:
    nodes: tuple[int, ...]
    edge_ids: tuple[int, ...]
    total_cost: float


# Dijkstra
def shortest_path(
    graph: Graph,
    start: int,
    end: int,
    extra_edges: Mapping[int, tuple[Edge, ...]] | None = None,
) -> Path | None:
    if extra_edges is None:
        extra_edges = {}

    distances = {start: 0.0}
    previous: dict[int, tuple[int, int]] = {}
    queue = [(0.0, start)]

    while queue:
        current_cost, current_node = heapq.heappop(queue)

        if current_cost > distances[current_node]:
            continue

        if current_node == end:
            nodes, edge_ids = build_path(previous, start, end)

            return Path(nodes=nodes, edge_ids=edge_ids, total_cost=current_cost)

        edges = [*graph.get(current_node, []), *extra_edges.get(current_node, ())]

        for edge in edges:
            new_cost = current_cost + edge.cost
            known_cost = distances.get(edge.target, float("inf"))

            if new_cost < known_cost:
                distances[edge.target] = new_cost
                previous[edge.target] = (current_node, edge.id)
                heapq.heappush(queue, (new_cost, edge.target))

    return None


def shortest_distance(
    graph: Graph,
    start: int,
    end: int,
) -> float | None:
    path = shortest_path(graph, start, end)

    if path is None:
        return None

    return path.total_cost


def build_path(
    previous: dict[int, tuple[int, int]],
    start: int,
    end: int,
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    nodes = [end]
    edge_ids = []
    current = end

    while current != start:
        current, edge_id = previous[current]
        nodes.append(current)
        edge_ids.append(edge_id)

    nodes.reverse()
    edge_ids.reverse()

    return tuple(nodes), tuple(edge_ids)
