from array import array

from routing.positions import PackedNodePositions


def packed(*nodes: tuple[int, tuple[float, float, float]]) -> PackedNodePositions:
    node_ids = array("q", [node_id for node_id, _ in nodes])
    coordinates = array("d")

    for _, position in nodes:
        coordinates.extend(position)

    return PackedNodePositions(node_ids=node_ids, coordinates=coordinates)


POSITIONS = packed(
    (11, (1.0, 2.0, 3.0)),
    (22, (4.0, 5.0, 6.0)),
    (33, (7.0, 8.0, 9.0)),
)


def test_finds_the_first_position() -> None:
    assert POSITIONS.get(11) == (1.0, 2.0, 3.0)


def test_finds_a_middle_position() -> None:
    assert POSITIONS.get(22) == (4.0, 5.0, 6.0)


def test_finds_the_last_position() -> None:
    assert POSITIONS.get(33) == (7.0, 8.0, 9.0)


def test_returns_none_for_an_id_between_known_ids() -> None:
    assert POSITIONS.get(23) is None


def test_returns_none_for_an_id_past_the_end() -> None:
    assert POSITIONS.get(99) is None


def test_returns_none_for_synthetic_route_node_ids() -> None:
    # Origin and destination nodes are negative and never stored, so they sort
    # below every real id and must not be mistaken for the first entry.
    assert POSITIONS.get(-9_000_000_000_000_001) is None


def test_returns_none_when_empty() -> None:
    assert packed().get(11) is None
