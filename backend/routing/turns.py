from dataclasses import dataclass, field

from routing.graph import NO_WAY_ID


@dataclass(frozen=True, slots=True)
class TurnRules:
    blocked: dict[tuple[int, int, int], frozenset[str]]
    only_allowed: dict[tuple[int, int], frozenset[int]]

    # Every node a rule can be keyed on. Derived rather than passed in so it
    # can never drift from the rules it summarises.
    via_nodes: frozenset[int] = field(init=False)

    def __post_init__(self) -> None:
        via_nodes = {via_node_id for _, via_node_id, _ in self.blocked}
        via_nodes.update(via_node_id for _, via_node_id in self.only_allowed)

        object.__setattr__(self, "via_nodes", frozenset(via_nodes))


EMPTY_TURN_RULES = TurnRules(blocked={}, only_allowed={})


def load_turn_rules_from_database() -> TurnRules:
    from routing.models import TurnRestriction

    blocked: dict[tuple[int, int, int], set[str]] = {}
    only_allowed: dict[tuple[int, int], set[int]] = {}

    rows = TurnRestriction.objects.values_list(
        "restriction",
        "from_way_id",
        "via_node_id",
        "to_way_id",
    ).iterator(chunk_size=10_000)

    for restriction, from_way_id, via_node_id, to_way_id in rows:
        if restriction.startswith("no_"):
            key = (from_way_id, via_node_id, to_way_id)
            blocked.setdefault(key, set()).add(restriction)
        elif restriction.startswith("only_"):
            key = (from_way_id, via_node_id)
            only_allowed.setdefault(key, set()).add(to_way_id)

    return TurnRules(
        blocked={key: frozenset(restrictions) for key, restrictions in blocked.items()},
        only_allowed={
            key: frozenset(to_way_ids) for key, to_way_ids in only_allowed.items()
        },
    )


def permits_turn(
    rules: TurnRules,
    *,
    incoming_way_id: int,
    incoming_source_node_id: int,
    via_node_id: int,
    outgoing_way_id: int,
    outgoing_target_node_id: int,
) -> bool:
    """Decide whether a movement through `via_node_id` is allowed.

    Ways and nodes arrive as plain ids rather than as an edge, so a caller
    holding the graph in flat arrays does not have to build an object to ask. A
    rule names both of its ways, so NO_WAY_ID on either side of the movement
    means no rule can match it.
    """
    if incoming_way_id == NO_WAY_ID or outgoing_way_id == NO_WAY_ID:
        return True

    blocked_restrictions = rules.blocked.get(
        (incoming_way_id, via_node_id, outgoing_way_id),
        frozenset(),
    )

    if blocked_restrictions:
        if blocked_restrictions == {"no_u_turn"}:
            return outgoing_target_node_id != incoming_source_node_id

        return False

    only_allowed = rules.only_allowed.get((incoming_way_id, via_node_id))

    if only_allowed is not None and outgoing_way_id not in only_allowed:
        return False

    return True
