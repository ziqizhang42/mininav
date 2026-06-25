import re
from collections.abc import Mapping
from typing import Literal

DRIVING_SPEEDS_KPH = {
    "motorway": 100,
    "motorway_link": 50,
    "trunk": 80,
    "trunk_link": 40,
    "primary": 70,
    "primary_link": 35,
    "secondary": 60,
    "secondary_link": 30,
    "tertiary": 50,
    "tertiary_link": 25,
    "unclassified": 40,
    "residential": 30,
    "living_street": 10,
    "service": 20,
}

Direction = Literal["forward", "backward"]

_NUMERIC_MAXSPEED_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(?:km/h|kph|kmh)?\s*$", re.I)
_MPH_MAXSPEED_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*mph\s*$", re.I)


def driving_cost_seconds(
    distance: float,
    tags: Mapping[str, str],
    direction: Direction | None = None,
) -> float | None:
    speed_kph = driving_speed_kph(tags, direction=direction)

    if speed_kph is None:
        return None

    speed_meters_per_second = speed_kph / 3.6

    return distance / speed_meters_per_second


def driving_speed_kph(
    tags: Mapping[str, str],
    direction: Direction | None = None,
) -> float | None:
    if direction is not None:
        directional_speed = parse_maxspeed(tags.get(f"maxspeed:{direction}"))

        if directional_speed is not None:
            return directional_speed

    tagged_speed = parse_maxspeed(tags.get("maxspeed"))

    if tagged_speed is not None:
        return tagged_speed

    return DRIVING_SPEEDS_KPH.get(tags.get("highway", ""))


def parse_maxspeed(value: str | None) -> float | None:
    if value is None:
        return None

    numeric_match = _NUMERIC_MAXSPEED_RE.match(value)

    if numeric_match:
        return float(numeric_match.group(1))

    mph_match = _MPH_MAXSPEED_RE.match(value)

    if mph_match:
        return float(mph_match.group(1)) * 1.609344

    return None
