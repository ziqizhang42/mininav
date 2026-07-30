from routing.positions import empty_positions


def test_allocates_a_position_per_node() -> None:
    positions = empty_positions(4)

    assert list(positions.x) == [0.0, 0.0, 0.0, 0.0]
    assert list(positions.y) == [0.0, 0.0, 0.0, 0.0]
    assert list(positions.z) == [0.0, 0.0, 0.0, 0.0]


def test_allocates_nothing_for_a_graph_with_no_nodes() -> None:
    positions = empty_positions(0)

    assert len(positions.x) == 0
