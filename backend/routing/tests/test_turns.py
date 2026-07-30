from routing.graph import NO_WAY_ID
from routing.turns import TurnRules, permits_turn

NO_RULES = TurnRules(blocked={}, only_allowed={})


def test_allows_turn_when_no_rule_matches() -> None:
    assert permits_turn(
        NO_RULES,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=20,
        outgoing_target_node_id=3,
    )


def test_blocks_no_turn_restriction() -> None:
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )

    assert not permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=20,
        outgoing_target_node_id=3,
    )


def test_only_restriction_blocks_other_outgoing_ways() -> None:
    rules = TurnRules(
        blocked={},
        only_allowed={(10, 2): frozenset({30})},
    )

    assert not permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=20,
        outgoing_target_node_id=3,
    )


def test_only_restriction_allows_named_to_way() -> None:
    rules = TurnRules(
        blocked={},
        only_allowed={(10, 2): frozenset({30})},
    )

    assert permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=30,
        outgoing_target_node_id=4,
    )


def test_no_u_turn_blocks_returning_to_incoming_source() -> None:
    rules = TurnRules(
        blocked={(10, 2, 10): frozenset({"no_u_turn"})},
        only_allowed={},
    )

    assert not permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=10,
        outgoing_target_node_id=1,
    )


def test_no_u_turn_allows_continuing_on_same_osm_way() -> None:
    rules = TurnRules(
        blocked={(10, 2, 10): frozenset({"no_u_turn"})},
        only_allowed={},
    )

    assert permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=10,
        outgoing_target_node_id=3,
    )


def test_allows_turn_when_either_way_is_unknown() -> None:
    """An edge belonging to no OSM way cannot match a rule that names ways."""
    rules = TurnRules(
        blocked={(10, 2, 20): frozenset({"no_right_turn"})},
        only_allowed={},
    )

    assert permits_turn(
        rules,
        incoming_way_id=NO_WAY_ID,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=20,
        outgoing_target_node_id=3,
    )

    assert permits_turn(
        rules,
        incoming_way_id=10,
        incoming_source_node_id=1,
        via_node_id=2,
        outgoing_way_id=NO_WAY_ID,
        outgoing_target_node_id=3,
    )
