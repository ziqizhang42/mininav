import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from math import asin, cos, isfinite, radians, sin, sqrt

UPSTREAM_RESULT_LIMIT = 40
SEARCH_RESULT_LIMIT = 5

LOW_VALUE_TYPES = {
    "bench",
    "bicycle_parking",
    "elevator",
    "guidepost",
    "parking_entrance",
    "parking_space",
    "platform",
    "smoking_area",
    "waste_basket",
}

HIGH_VALUE_CATEGORIES = {
    "aeroway",
    "amenity",
    "leisure",
    "office",
    "place",
    "shop",
    "tourism",
}

ROAD_TYPES = {
    "living_street",
    "motorway",
    "primary",
    "residential",
    "secondary",
    "service",
    "tertiary",
    "trunk",
    "unclassified",
}


@dataclass(frozen=True, slots=True)
class SearchBounds:
    west: float
    south: float
    east: float
    north: float

    def contains(self, longitude: float, latitude: float) -> bool:
        return (
            self.west <= longitude <= self.east and self.south <= latitude <= self.north
        )

    def nominatim_viewbox(self) -> str:
        return f"{self.west},{self.north},{self.east},{self.south}"


@dataclass(frozen=True, slots=True)
class SearchFocus:
    longitude: float
    latitude: float


def nominatim_search_parameters(
    query: str,
    bounds: SearchBounds | None,
) -> dict[str, str | int]:
    params: dict[str, str | int] = {
        "q": query,
        "format": "jsonv2",
        "limit": UPSTREAM_RESULT_LIMIT,
        "addressdetails": 1,
        "countrycodes": "ca",
        "accept-language": "en",
    }

    if bounds is not None:
        params["viewbox"] = bounds.nominatim_viewbox()

    return params


def rank_search_results(
    places: object,
    query: str,
    *,
    bounds: SearchBounds | None,
    focus: SearchFocus | None,
    limit: int = SEARCH_RESULT_LIMIT,
) -> list[dict[str, str | float | None]]:
    if not isinstance(places, list):
        return []

    ranked_results = []

    for upstream_index, place in enumerate(places):
        if not isinstance(place, Mapping):
            continue

        result = _normalized_result(place, query)

        if result is None:
            continue

        longitude = result["longitude"]
        latitude = result["latitude"]
        assert isinstance(longitude, float)
        assert isinstance(latitude, float)

        inside_bounds = bounds is not None and bounds.contains(longitude, latitude)
        distance = (
            _distance_meters(focus, longitude, latitude)
            if focus is not None
            else float("inf")
        )
        importance = _finite_float(place.get("importance")) or 0.0

        sort_key = (
            -_text_match_quality(place, query),
            -int(inside_bounds),
            -_result_usefulness(result),
            distance,
            -importance,
            upstream_index,
        )
        ranked_results.append((sort_key, result))

    ranked_results.sort(key=lambda item: item[0])
    return [result for _, result in ranked_results[:limit]]


def _normalized_result(
    place: Mapping,
    query: str,
) -> dict[str, str | float | None] | None:
    longitude = _finite_float(place.get("lon"))
    latitude = _finite_float(place.get("lat"))

    if longitude is None or latitude is None:
        return None

    osm_type = _optional_string(place.get("osm_type"))
    osm_id = place.get("osm_id")
    place_id = place.get("place_id")

    if osm_type is not None and osm_id is not None:
        result_id = f"{osm_type}:{osm_id}"
    elif place_id is not None:
        result_id = str(place_id)
    else:
        return None

    return {
        "id": result_id,
        "label": _optional_string(place.get("display_name")) or query,
        "longitude": longitude,
        "latitude": latitude,
        "category": _optional_string(place.get("category")),
        "type": _optional_string(place.get("type")),
    }


def _text_match_quality(place: Mapping, query: str) -> int:
    normalized_query = _normalize_text(query)
    normalized_name = _normalize_text(
        _optional_string(place.get("name"))
        or _optional_string(place.get("display_name"))
        or ""
    )
    normalized_label = _normalize_text(
        _optional_string(place.get("display_name")) or ""
    )

    if normalized_name == normalized_query:
        return 4

    if normalized_name.startswith(normalized_query):
        return 3

    if normalized_query in normalized_name:
        return 2

    query_words = normalized_query.split()
    label_words = set(normalized_label.split())

    if query_words and all(word in label_words for word in query_words):
        return 1

    return 0


def _result_usefulness(result: Mapping) -> int:
    category = result.get("category")
    result_type = result.get("type")

    if result_type in LOW_VALUE_TYPES:
        return 0

    if category in HIGH_VALUE_CATEGORIES:
        return 4

    if category == "highway":
        return 3 if result_type in ROAD_TYPES else 1

    if category in {"boundary", "natural", "man_made"}:
        return 3

    if category in {"building", "landuse"}:
        return 2

    return 1


def _distance_meters(
    focus: SearchFocus,
    longitude: float,
    latitude: float,
) -> float:
    earth_radius_meters = 6_371_000
    latitude_1 = radians(focus.latitude)
    latitude_2 = radians(latitude)
    delta_latitude = latitude_2 - latitude_1
    delta_longitude = radians(longitude - focus.longitude)

    haversine = (
        sin(delta_latitude / 2) ** 2
        + cos(latitude_1) * cos(latitude_2) * sin(delta_longitude / 2) ** 2
    )

    return 2 * earth_radius_meters * asin(sqrt(haversine))


def _finite_float(value: object) -> float | None:
    try:
        converted = float(value)
    except TypeError, ValueError:
        return None

    return converted if isfinite(converted) else None


def _optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    stripped = value.strip()
    return stripped or None


def _normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_marks = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return re.sub(r"[^\w]+", " ", without_marks).strip()
