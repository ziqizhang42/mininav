from routing.api.serializers import SearchQuerySerializer
from routing.search import (
    SearchBounds,
    SearchFocus,
    nominatim_search_parameters,
    rank_search_results,
)

CALGARY_BOUNDS = SearchBounds(
    west=-114.4,
    south=50.8,
    east=-113.8,
    north=51.3,
)
CALGARY_FOCUS = SearchFocus(longitude=-114.0719, latitude=51.0447)


def place(
    place_id,
    name,
    longitude,
    latitude,
    *,
    category="amenity",
    result_type="cafe",
    display_name=None,
    importance=0.00001,
):
    return {
        "place_id": place_id,
        "name": name,
        "display_name": display_name or f"{name}, Alberta, Canada",
        "lon": str(longitude),
        "lat": str(latitude),
        "category": category,
        "type": result_type,
        "importance": importance,
    }


def test_search_query_accepts_viewbox_and_focus() -> None:
    serializer = SearchQuerySerializer(
        data={
            "q": " Starbucks ",
            "viewbox": "-114.4,50.8,-113.8,51.3",
            "focus": "-114.0719,51.0447",
        }
    )

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {
        "q": "Starbucks",
        "viewbox": (-114.4, 50.8, -113.8, 51.3),
        "focus": (-114.0719, 51.0447),
    }


def test_search_query_rejects_an_inverted_viewbox() -> None:
    serializer = SearchQuerySerializer(
        data={
            "q": "Starbucks",
            "viewbox": "-113.8,50.8,-114.4,51.3",
        }
    )

    assert not serializer.is_valid()
    assert "viewbox" in serializer.errors


def test_nominatim_search_requests_more_candidates_and_viewbox() -> None:
    params = nominatim_search_parameters("Starbucks", CALGARY_BOUNDS)

    assert params["limit"] == 40
    assert params["viewbox"] == "-114.4,51.3,-113.8,50.8"


def test_ranks_nearby_in_viewport_result_before_far_result() -> None:
    places = [
        place(1, "Starbucks", -118.7773, 55.1570),
        place(2, "Starbucks", -114.0731, 51.0450),
    ]

    results = rank_search_results(
        places,
        "Starbucks",
        bounds=CALGARY_BOUNDS,
        focus=CALGARY_FOCUS,
    )

    assert [result["id"] for result in results] == ["2", "1"]


def test_prefers_useful_destination_over_auxiliary_map_feature() -> None:
    places = [
        place(
            1,
            "2500 University Drive NW",
            -114.0719,
            51.0447,
            result_type="bicycle_parking",
        ),
        place(
            2,
            "2500 University Drive NW",
            -114.12,
            51.07,
            result_type="university",
        ),
    ]

    results = rank_search_results(
        places,
        "2500 University Drive NW",
        bounds=CALGARY_BOUNDS,
        focus=CALGARY_FOCUS,
    )

    assert [result["id"] for result in results] == ["2", "1"]


def test_exact_name_match_beats_closer_partial_match() -> None:
    places = [
        place(1, "Calgary Tower Gift Shop", -114.0630, 51.0444),
        place(
            2,
            "Calgary Tower",
            -114.08,
            51.05,
            category="man_made",
            result_type="tower",
        ),
    ]

    results = rank_search_results(
        places,
        "Calgary Tower",
        bounds=CALGARY_BOUNDS,
        focus=CALGARY_FOCUS,
    )

    assert [result["id"] for result in results] == ["2", "1"]
