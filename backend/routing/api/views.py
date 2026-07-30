import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from routing.api.serializers import (
    RouteRequestSerializer,
    RouteResponseSerializer,
    SearchQuerySerializer,
    SearchResultSerializer,
)
from routing.search import (
    SearchBounds,
    SearchFocus,
    nominatim_search_parameters,
    rank_search_results,
)
from routing.services import calculate_route


class RouteView(APIView):
    def post(self, request):
        request_serializer = RouteRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        data = request_serializer.validated_data
        origin = data["origin"]
        destination = data["destination"]

        try:
            route = calculate_route(
                origin["longitude"],
                origin["latitude"],
                destination["longitude"],
                destination["latitude"],
            )
        except ValueError as error:
            return Response(
                {"detail": str(error)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        response_data = {
            "origin": {
                "edge_id": route.origin.edge_id,
                "longitude": route.origin.longitude,
                "latitude": route.origin.latitude,
                "snap_distance_meters": route.origin.distance_meters,
            },
            "destination": {
                "edge_id": route.destination.edge_id,
                "longitude": route.destination.longitude,
                "latitude": route.destination.latitude,
                "snap_distance_meters": route.destination.distance_meters,
            },
            "distance_meters": route.distance_meters,
            "duration_seconds": route.duration_seconds,
            "edge_count": sum(1 for edge_id in route.edge_ids if edge_id > 0),
            "geometry": route.geometry,
            "steps": [
                {
                    "sequence": step.sequence,
                    "instruction": step.instruction,
                    "road_name": step.road_name,
                    "distance_meters": step.distance_meters,
                    "duration_seconds": step.duration_seconds,
                    "maneuver": {
                        "type": step.maneuver.type,
                        "modifier": step.maneuver.modifier,
                        "location": step.maneuver.location,
                        "bearing_before": step.maneuver.bearing_before,
                        "bearing_after": step.maneuver.bearing_after,
                    },
                    "geometry": step.geometry,
                }
                for step in route.steps
            ],
        }

        response_serializer = RouteResponseSerializer(response_data)

        return Response(response_serializer.data)


class SearchView(APIView):
    def get(self, request):
        request_serializer = SearchQuerySerializer(data=request.query_params)
        request_serializer.is_valid(raise_exception=True)

        data = request_serializer.validated_data
        query = data["q"]
        bounds = SearchBounds(*data["viewbox"]) if "viewbox" in data else None
        focus = SearchFocus(*data["focus"]) if "focus" in data else None
        params = urlencode(nominatim_search_parameters(query, bounds))

        url = f"{settings.NOMINATIM_BASE_URL.rstrip('/')}/search?{params}"
        upstream_request = Request(url, headers={"Accept": "application/json"})

        try:
            with urlopen(upstream_request, timeout=5) as response:
                places = json.load(response)
        except HTTPError, URLError, TimeoutError, json.JSONDecodeError:
            return Response(
                {"detail": "Search provider is unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        results = rank_search_results(
            places,
            query,
            bounds=bounds,
            focus=focus,
        )

        response_serializer = SearchResultSerializer(results, many=True)
        return Response(response_serializer.data)
