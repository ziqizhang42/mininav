import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RouteSegment:
    edge_id: int
    osm_way_id: int | None
    road_name: str | None
    road_class: str
    distance_meters: float
    duration_seconds: float
    coordinates: list[list[float]]


@dataclass(frozen=True, slots=True)
class Maneuver:
    type: str
    modifier: str | None
    location: list[float]
    bearing_before: float | None
    bearing_after: float | None


@dataclass(frozen=True, slots=True)
class RouteStep:
    sequence: int
    instruction: str
    road_name: str | None
    distance_meters: float
    duration_seconds: float
    maneuver: Maneuver
    geometry: dict[str, object]


@dataclass(slots=True)
class StepDraft:
    road_name: str | None
    osm_way_id: int | None
    distance_meters: float
    duration_seconds: float
    coordinates: list[list[float]]
    maneuver: Maneuver


def build_route_steps(segments: Sequence[RouteSegment]) -> tuple[RouteStep, ...]:
    usable_segments = [
        segment
        for segment in segments
        if segment.distance_meters > 0 and has_usable_geometry(segment.coordinates)
    ]

    if not usable_segments:
        return ()

    drafts: list[StepDraft] = []

    first_segment = usable_segments[0]
    drafts.append(
        StepDraft(
            road_name=first_segment.road_name,
            osm_way_id=first_segment.osm_way_id,
            distance_meters=first_segment.distance_meters,
            duration_seconds=first_segment.duration_seconds,
            coordinates=list(first_segment.coordinates),
            maneuver=Maneuver(
                type="depart",
                modifier=cardinal_direction_modifier(first_segment.coordinates),
                location=first_segment.coordinates[0],
                bearing_before=None,
                bearing_after=segment_start_bearing(first_segment.coordinates),
            ),
        )
    )

    for segment in usable_segments[1:]:
        current = drafts[-1]

        if same_instruction_road(current, segment):
            current.distance_meters += segment.distance_meters
            current.duration_seconds += segment.duration_seconds
            append_coordinates(current.coordinates, segment.coordinates)
            continue

        before = segment_end_bearing(current.coordinates)
        after = segment_start_bearing(segment.coordinates)
        modifier = turn_modifier(before, after)

        maneuver_type = "continue" if modifier == "straight" else "turn"

        drafts.append(
            StepDraft(
                road_name=segment.road_name,
                osm_way_id=segment.osm_way_id,
                distance_meters=segment.distance_meters,
                duration_seconds=segment.duration_seconds,
                coordinates=list(segment.coordinates),
                maneuver=Maneuver(
                    type=maneuver_type,
                    modifier=modifier,
                    location=segment.coordinates[0],
                    bearing_before=before,
                    bearing_after=after,
                ),
            )
        )

    steps = [
        RouteStep(
            sequence=index,
            instruction=instruction_for_draft(index, draft),
            road_name=draft.road_name,
            distance_meters=draft.distance_meters,
            duration_seconds=draft.duration_seconds,
            maneuver=draft.maneuver,
            geometry={
                "type": "LineString",
                "coordinates": draft.coordinates,
            },
        )
        for index, draft in enumerate(drafts)
    ]

    last_coordinate = usable_segments[-1].coordinates[-1]
    steps.append(
        RouteStep(
            sequence=len(steps),
            instruction="Arrive at destination",
            road_name=None,
            distance_meters=0,
            duration_seconds=0,
            maneuver=Maneuver(
                type="arrive",
                modifier=None,
                location=last_coordinate,
                bearing_before=segment_end_bearing(usable_segments[-1].coordinates),
                bearing_after=None,
            ),
            geometry={
                "type": "LineString",
                "coordinates": [last_coordinate, last_coordinate],
            },
        )
    )

    return tuple(steps)


def instruction_for_draft(index: int, draft: StepDraft) -> str:
    road_name = display_road_name(draft.road_name)

    if draft.maneuver.type == "depart":
        direction = draft.maneuver.modifier or "straight"
        return f"Head {direction} on {road_name}"

    if draft.maneuver.type == "continue":
        return f"Continue on {road_name}"

    if draft.maneuver.modifier == "u-turn":
        return f"Make a U-turn onto {road_name}"

    return f"Turn {draft.maneuver.modifier} onto {road_name}"


def same_instruction_road(draft: StepDraft, segment: RouteSegment) -> bool:
    if draft.osm_way_id is not None and draft.osm_way_id == segment.osm_way_id:
        return True

    if draft.road_name and segment.road_name:
        return draft.road_name == segment.road_name

    return False


def display_road_name(road_name: str | None) -> str:
    if road_name:
        return road_name

    return "unnamed road"


def has_usable_geometry(coordinates: Sequence[list[float]]) -> bool:
    return len(coordinates) >= 2 and coordinates[0] != coordinates[-1]


def append_coordinates(
    coordinates: list[list[float]],
    next_coordinates: Sequence[list[float]],
) -> None:
    if coordinates[-1] == next_coordinates[0]:
        coordinates.extend(next_coordinates[1:])
    else:
        coordinates.extend(next_coordinates)


def segment_start_bearing(coordinates: Sequence[list[float]]) -> float | None:
    return first_distinct_bearing(coordinates)


def segment_end_bearing(coordinates: Sequence[list[float]]) -> float | None:
    if len(coordinates) < 2:
        return None

    end = coordinates[-1]

    for start in reversed(coordinates[:-1]):
        if start != end:
            return bearing_degrees(start, end)

    return None


def first_distinct_bearing(coordinates: Sequence[list[float]]) -> float | None:
    if len(coordinates) < 2:
        return None

    start = coordinates[0]

    for end in coordinates[1:]:
        if start != end:
            return bearing_degrees(start, end)

    return None


def bearing_degrees(start: list[float], end: list[float]) -> float:
    start_longitude, start_latitude = map(math.radians, start)
    end_longitude, end_latitude = map(math.radians, end)

    longitude_delta = end_longitude - start_longitude

    y = math.sin(longitude_delta) * math.cos(end_latitude)
    x = math.cos(start_latitude) * math.sin(end_latitude) - math.sin(
        start_latitude
    ) * math.cos(end_latitude) * math.cos(longitude_delta)

    return (math.degrees(math.atan2(y, x)) + 360) % 360


def cardinal_direction_modifier(coordinates: Sequence[list[float]]) -> str | None:
    bearing = segment_start_bearing(coordinates)

    if bearing is None:
        return None

    directions = [
        "north",
        "northeast",
        "east",
        "southeast",
        "south",
        "southwest",
        "west",
        "northwest",
    ]

    index = round(bearing / 45) % len(directions)
    return directions[index]


def turn_modifier(before: float | None, after: float | None) -> str:
    if before is None or after is None:
        return "straight"

    delta = (after - before + 540) % 360 - 180
    absolute_delta = abs(delta)

    if absolute_delta < 25:
        return "straight"

    if absolute_delta >= 135:
        return "u-turn"

    side = "right" if delta > 0 else "left"

    if absolute_delta < 45:
        return f"slight {side}"

    return side
