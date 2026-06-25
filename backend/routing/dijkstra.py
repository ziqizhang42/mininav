import heapq
from collections.abc import Mapping
from dataclasses import dataclass

from routing.graph import Edge, Graph
from routing.turns import EMPTY_TURN_RULES, TurnRules, permits_turn


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
    turn_rules: TurnRules = EMPTY_TURN_RULES,
) -> Path | None:
    if extra_edges is None:
        extra_edges = {}

    start_state = (start, None)
    distances = {start_state: 0.0}
    previous: dict[tuple[int, int | None], tuple[tuple[int, int | None], int]] = {}
    queue = [(0.0, start, None)]

    edges_by_id = {edge.id: edge for edges in graph.values() for edge in edges}

    for edges in extra_edges.values():
        for edge in edges:
            edges_by_id[edge.id] = edge

    while queue:
        current_cost, current_node, incoming_edge_id = heapq.heappop(queue)
        current_state = (current_node, incoming_edge_id)

        if current_cost > distances[current_state]:
            continue

        if current_node == end:
            nodes, edge_ids = build_path(previous, start_state, current_state)

            return Path(nodes=nodes, edge_ids=edge_ids, total_cost=current_cost)

        incoming_edge = (
            edges_by_id[incoming_edge_id] if incoming_edge_id is not None else None
        )

        edges = [*graph.get(current_node, []), *extra_edges.get(current_node, ())]

        for edge in edges:
            if not permits_turn(
                turn_rules,
                incoming_way_id=(
                    incoming_edge.osm_way_id if incoming_edge is not None else None
                ),
                incoming_source_node_id=(
                    incoming_edge.source if incoming_edge is not None else None
                ),
                via_node_id=current_node,
                outgoing_edge=edge,
            ):
                continue

            next_state = (edge.target, edge.id)
            new_cost = current_cost + edge.cost
            known_cost = distances.get(next_state, float("inf"))

            if new_cost < known_cost:
                distances[next_state] = new_cost
                previous[next_state] = (current_state, edge.id)
                heapq.heappush(queue, (new_cost, edge.target, edge.id))

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
    previous: dict[tuple[int, int | None], tuple[tuple[int, int | None], int]],
    start: tuple[int, int | None],
    end: tuple[int, int | None],
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    nodes = [end[0]]
    edge_ids = []
    current = end

    while current != start:
        previous_state, edge_id = previous[current]
        nodes.append(previous_state[0])
        edge_ids.append(edge_id)
        current = previous_state

    nodes.reverse()
    edge_ids.reverse()

    return tuple(nodes), tuple(edge_ids)
