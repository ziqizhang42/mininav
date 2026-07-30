import heapq
from array import array
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from routing.graph import NO_NODE_ID, NO_WAY_ID, RoadGraph
from routing.turns import EMPTY_TURN_RULES, TurnRules, permits_turn

INFINITY = float("inf")

# Graph edges are identified by their slots in parallel arrays. NO_SLOT means
# there is no recorded incoming edge, either at a start or an unrestricted node.
NO_SLOT = -1


@dataclass(frozen=True, slots=True)
class Path:
    nodes: tuple[int, ...]
    edge_ids: tuple[int, ...]
    total_cost: float


@dataclass(frozen=True, slots=True)
class RouteEnd:
    """Describe where a route endpoint connects to the graph.

    For an endpoint partway along a road, `node_id` is the graph node it connects
    to, while `cost` and `edge_id` describe the partial hop. `way_id` and
    `far_node_id` give its direction: toward `node_id` at a start and away from
    it at a finish. This lets turn restrictions include the partial hop.

    The defaults describe an endpoint directly on a graph node.
    """

    node_id: int
    cost: float = 0.0
    edge_id: int | None = None
    way_id: int = NO_WAY_ID
    far_node_id: int = NO_NODE_ID


def shortest_path(
    graph: RoadGraph,
    start: int,
    end: int,
    turn_rules: TurnRules = EMPTY_TURN_RULES,
    heuristic: Callable[[int], float] | None = None,
) -> Path | None:
    """Find the cheapest route between two graph nodes, named by OSM id."""
    return shortest_route(
        graph,
        starts=(RouteEnd(node_id=start),),
        finishes=(RouteEnd(node_id=end),),
        turn_rules=turn_rules,
        heuristic=heuristic,
    )


def shortest_distance(
    graph: RoadGraph,
    start: int,
    end: int,
) -> float | None:
    path = shortest_path(graph, start, end)

    if path is None:
        return None

    return path.total_cost


def shortest_route(
    graph: RoadGraph,
    starts: Iterable[RouteEnd],
    finishes: Iterable[RouteEnd],
    turn_rules: TurnRules = EMPTY_TURN_RULES,
    heuristic: Callable[[int], float] | None = None,
) -> Path | None:
    """Find the cheapest route from any start to any finish.

    This uses A*, or Dijkstra when no heuristic is supplied. The heuristic gets
    an internal node index instead of an OSM id so it can read arrays directly.

    `RouteEnd` supports endpoints partway along a road. The search still walks
    only graph nodes and edges, then adds the partial endpoint hops to the path.
    """
    if heuristic is None:
        heuristic = no_heuristic

    # A city-scale search may inspect hundreds of thousands of edges. Local
    # names avoid repeated attribute lookups in this hot loop.
    index_of = graph.index_of
    offsets = graph.offsets
    sources = graph.sources
    targets = graph.targets
    costs = graph.costs
    way_ids = graph.way_ids
    node_ids = graph.node_ids
    edge_ids_by_slot = graph.edge_ids
    via_flags = dense_via_flags(graph, turn_rules)
    push = heapq.heappush
    pop = heapq.heappop

    # Most nodes need one distance. At the few nodes with turn restrictions,
    # distance also depends on the incoming edge, so those states use a dict.
    distances = array("d", [INFINITY]) * graph.node_count
    arrived_slot = array("i", [NO_SLOT]) * graph.node_count
    previous_slot = array("i", [NO_SLOT]) * graph.node_count
    turn_distances: dict[tuple[int, int], float] = {}
    turn_previous_slot: dict[tuple[int, int], int] = {}

    # All fields are numeric, so heapq can break exact ties using later fields.
    # This avoids a separate tiebreaker and keeps tied searches deterministic.
    queue: list[tuple[float, float, int, int]] = []
    start_by_state: dict[tuple[int, int], RouteEnd] = {}

    for start in starts:
        index = index_of.get(start.node_id)

        if index is None:
            continue

        # Keep the start's approach edge only if a restriction there may need it.
        slot = approach_slot(graph, start, index) if via_flags[index] else NO_SLOT

        if slot == NO_SLOT:
            if start.cost >= distances[index]:
                continue

            distances[index] = start.cost
        else:
            if start.cost >= turn_distances.get((index, slot), INFINITY):
                continue

            turn_distances[(index, slot)] = start.cost

        start_by_state[(index, slot)] = start
        push(queue, (start.cost + heuristic(index), start.cost, index, slot))

    finishes_by_index: dict[int, list[RouteEnd]] = {}

    for finish in finishes:
        index = index_of.get(finish.node_id)

        if index is not None:
            finishes_by_index.setdefault(index, []).append(finish)

    best_cost = INFINITY
    best_arrival: tuple[int, int, RouteEnd] | None = None

    while queue:
        estimate, current_cost, index, incoming_slot = pop(queue)

        # With an admissible heuristic, estimates never overstate the cost.
        # Stop when even the best remaining estimate cannot beat the best route.
        if estimate >= best_cost:
            break

        if incoming_slot == NO_SLOT:
            if current_cost > distances[index]:
                continue
        elif current_cost > turn_distances[(index, incoming_slot)]:
            continue

        # Only nodes named in a turn rule need incoming-road details.
        if incoming_slot != NO_SLOT and via_flags[index]:
            incoming_way_id = way_ids[incoming_slot]
            incoming_source_node_id = node_ids[sources[incoming_slot]]
            via_node_id = node_ids[index]
        else:
            incoming_way_id = NO_WAY_ID

        for finish in finishes_by_index.get(index, ()):
            total_cost = current_cost + finish.cost

            if total_cost < best_cost and (
                incoming_way_id == NO_WAY_ID
                or permits_turn(
                    turn_rules,
                    incoming_way_id=incoming_way_id,
                    incoming_source_node_id=incoming_source_node_id,
                    via_node_id=via_node_id,
                    outgoing_way_id=finish.way_id,
                    outgoing_target_node_id=finish.far_node_id,
                )
            ):
                best_cost = total_cost
                best_arrival = (index, incoming_slot, finish)

        for slot in range(offsets[index], offsets[index + 1]):
            target = targets[slot]
            new_cost = current_cost + costs[slot]

            if incoming_way_id != NO_WAY_ID and not permits_turn(
                turn_rules,
                incoming_way_id=incoming_way_id,
                incoming_source_node_id=incoming_source_node_id,
                via_node_id=via_node_id,
                outgoing_way_id=way_ids[slot],
                outgoing_target_node_id=node_ids[target],
            ):
                continue

            # At unrestricted nodes, arrival direction cannot affect the route,
            # so all arrivals share one state.
            if via_flags[target]:
                state = (target, slot)

                if new_cost >= turn_distances.get(state, INFINITY):
                    continue

                turn_distances[state] = new_cost
                turn_previous_slot[state] = incoming_slot
                next_incoming_slot = slot
            else:
                if new_cost >= distances[target]:
                    continue

                distances[target] = new_cost
                arrived_slot[target] = slot
                previous_slot[target] = incoming_slot
                next_incoming_slot = NO_SLOT

            push(
                queue,
                (new_cost + heuristic(target), new_cost, target, next_incoming_slot),
            )

    if best_arrival is None:
        return None

    end_index, end_incoming_slot, finish = best_arrival
    node_indexes, edge_ids, start_slot = build_path(
        end_index,
        end_incoming_slot,
        sources,
        edge_ids_by_slot,
        arrived_slot,
        previous_slot,
        turn_previous_slot,
    )
    start = start_by_state[(node_indexes[0], start_slot)]
    reported_edge_ids = (start.edge_id, *edge_ids, finish.edge_id)

    return Path(
        nodes=tuple(node_ids[index] for index in node_indexes),
        edge_ids=tuple(edge_id for edge_id in reported_edge_ids if edge_id is not None),
        total_cost=best_cost,
    )


def no_heuristic(index: int) -> float:
    return 0.0


def approach_slot(graph: RoadGraph, start: RouteEnd, index: int) -> int:
    """Find the edge slot used to approach a start, or NO_SLOT.

    A turn restriction at the start may need the direction of its partial hop.
    The matching edge leaves `far_node_id`; its short edge list is cheap to scan.
    """
    if start.way_id == NO_WAY_ID or start.far_node_id == NO_NODE_ID:
        return NO_SLOT

    from_index = graph.index_of.get(start.far_node_id)

    if from_index is None:
        return NO_SLOT

    for slot in range(graph.offsets[from_index], graph.offsets[from_index + 1]):
        if graph.targets[slot] == index and graph.way_ids[slot] == start.way_id:
            return slot

    return NO_SLOT


def dense_via_flags(graph: RoadGraph, turn_rules: TurnRules) -> bytearray:
    """Mark the internal indexes of nodes that have turn restrictions."""
    flags = bytearray(graph.node_count)
    index_of = graph.index_of

    for node_id in turn_rules.via_nodes:
        index = index_of.get(node_id)

        if index is not None:
            flags[index] = 1

    return flags


def build_path(
    end_index: int,
    end_incoming_slot: int,
    sources: array,
    edge_ids_by_slot: array,
    arrived_slot: array,
    previous_slot: array,
    turn_previous_slot: dict[tuple[int, int], int],
) -> tuple[list[int], list[int], int]:
    """Rebuild a route by following its edges back to the chosen start.

    Regular-node predecessors live in arrays; turn-restricted states use a dict.
    A missing predecessor marks the start. Its incoming slot is returned so the
    caller can identify which `RouteEnd` was used.
    """
    node_indexes = [end_index]
    edge_ids: list[int] = []
    index = end_index
    incoming_slot = end_incoming_slot

    while True:
        if incoming_slot == NO_SLOT:
            slot = arrived_slot[index]

            if slot == NO_SLOT:
                break

            previous = previous_slot[index]
        else:
            previous = turn_previous_slot.get((index, incoming_slot))

            if previous is None:
                break

            slot = incoming_slot

        edge_ids.append(edge_ids_by_slot[slot])
        index = sources[slot]
        incoming_slot = previous
        node_indexes.append(index)

    node_indexes.reverse()
    edge_ids.reverse()

    return node_indexes, edge_ids, incoming_slot
