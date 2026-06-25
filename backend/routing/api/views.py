from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from routing.api.serializers import RouteRequestSerializer, RouteResponseSerializer
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
        }

        response_serializer = RouteResponseSerializer(response_data)

        return Response(response_serializer.data)
