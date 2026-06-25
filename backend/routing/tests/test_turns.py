from routing.graph import Edge
from routing.turns import TurnRules, permits_turn


def test_allows_turn_when_no_rule_matches() -> None:
    edge = Edge(id=2, source=2, target=3, cost=1, osm_way_id=20)

    assert permits_turn(
        TurnRules(blocked={}, only_allowed={}),
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_edge=edge,
    )


def test_blocks_no_turn_restriction() -> None:
    edge = Edge(id=2, source=2, target=3, cost=1, osm_way_id=20)

    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )

    assert not permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_edge=edge,
    )


def test_only_restriction_blocks_other_outgoing_ways() -> None:
    edge = Edge(id=2, source=2, target=3, cost=1, osm_way_id=20)

    rules = TurnRules(
        blocked={},
        only_allowed={(10, 2): frozenset({30})},
    )

    assert not permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_edge=edge,
    )


def test_only_restriction_allows_named_to_way() -> None:
    edge = Edge(id=3, source=2, target=4, cost=1, osm_way_id=30)

    rules = TurnRules(
        blocked={},
        only_allowed={(10, 2): frozenset({30})},
    )

    assert permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_edge=edge,
    )


def test_no_u_turn_blocks_returning_to_incoming_source() -> None:
    edge = Edge(id=2, source=2, target=1, cost=1, osm_way_id=10)

    rules = TurnRules(
        blocked={(10, 2, 10): frozenset({"no_u_turn"})},
        only_allowed={},
    )

    assert not permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_edge=edge,
    )


def test_no_u_turn_allows_continuing_on_same_osm_way() -> None:
    edge = Edge(id=2, source=2, target=3, cost=1, osm_way_id=10)

    rules = TurnRules(
        blocked={(10, 2, 10): frozenset({"no_u_turn"})},
        only_allowed={},
    )

    assert permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_edge=edge,
    )
