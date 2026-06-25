import pytest

from routing.costs import driving_cost_seconds, driving_speed_kph, parse_maxspeed
from routing.geo import distance_meters


def test_calculates_distance_between_corrdinates() -> None:
    distance = distance_meters(0, 0, 0, 1)

    assert distance == pytest.approx(111_195, rel=0.001)


def test_calculates_travel_time_from_maxspeed() -> None:
    cost = driving_cost_seconds(
        distance=1_000,
        tags={"highway": "residential", "maxspeed": "50"},
    )

    assert cost == pytest.approx(72)


def test_falls_back_to_road_class_speed() -> None:
    cost = driving_cost_seconds(distance=1_000, tags={"highway": "motorway"})

    assert cost == pytest.approx(36)


def test_rejects_unsupported_road_class() -> None:
    cost = driving_cost_seconds(distance=100, tags={"highway": "footway"})

    assert cost is None


def test_parses_kph_maxspeed() -> None:
    assert parse_maxspeed("80 km/h") == 80


def test_parses_mph_maxspeed() -> None:
    assert parse_maxspeed("50 mph") == pytest.approx(80.4672)


def test_ignores_non_numeric_maxspeed() -> None:
    assert parse_maxspeed("signals") is None


def test_directional_maxspeed_overrides_regular_maxspeed() -> None:
    speed = driving_speed_kph(
        {
            "highway": "secondary",
            "maxspeed": "60",
            "maxspeed:forward": "40",
        },
        direction="forward",
    )

    assert speed == 40
