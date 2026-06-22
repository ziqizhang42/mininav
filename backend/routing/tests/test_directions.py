from routing.directions import permitted_directions


def test_regular_road_allows_both_directions() -> None:
    assert permitted_directions({}) == (True, True)


def test_oneway_allows_only_forward_direction() -> None:
    assert permitted_directions({"oneway": "yes"}) == (True, False)


def test_negative_oneway_allows_only_reverse_direction() -> None:
    assert permitted_directions({"oneway": "-1"}) == (False, True)


def test_roundabout_is_oneway_by_default() -> None:
    assert permitted_directions({"junction": "roundabout"}) == (True, False)


def test_explicit_no_overrides_roundabout_default() -> None:
    assert permitted_directions({"junction": "roundabout", "oneway": "no"}) == (
        True,
        True,
    )
