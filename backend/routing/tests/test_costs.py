import pytest

from routing.costs import driving_cost_seconds
from routing.geo import distance_meters


def test_calculates_distance_between_corrdinates() -> None:
    distance = distance_meters(0, 0, 0, 1)

    assert distance == pytest.approx(111_195, rel=0.001)


def test_calculates_motorway_travel_time() -> None:
    cost = driving_cost_seconds(distance=1_000, road_class="motorway")

    assert cost == pytest.approx(36)


def test_rejects_unsupported_road_class() -> None:
    cost = driving_cost_seconds(distance=100, road_class="footway")

    assert cost is None
