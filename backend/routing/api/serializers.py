from rest_framework import serializers


class CoordinateSerializer(serializers.Serializer):
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    latitude = serializers.FloatField(min_value=-90, max_value=90)


class RouteRequestSerializer(serializers.Serializer):
    origin = CoordinateSerializer()
    destination = CoordinateSerializer()
    mode = serializers.ChoiceField(choices=["driving"], default="driving")


class SnappedCoordinateSerializer(CoordinateSerializer):
    edge_id = serializers.IntegerField()
    snap_distance_meters = serializers.FloatField()


class GeometrySerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["LineString"])
    coordinates = serializers.ListField(
        child=serializers.ListField(
            child=serializers.FloatField(),
            min_length=2,
            max_length=2,
        ),
        min_length=2,
    )


class ManeuverSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["depart", "turn", "continue", "arrive"])
    modifier = serializers.CharField(allow_null=True)
    location = serializers.ListField(
        child=serializers.FloatField(),
        min_length=2,
        max_length=2,
    )
    bearing_before = serializers.FloatField(allow_null=True)
    bearing_after = serializers.FloatField(allow_null=True)


class RouteStepSerializer(serializers.Serializer):
    sequence = serializers.IntegerField()
    instruction = serializers.CharField()
    road_name = serializers.CharField(allow_null=True)
    distance_meters = serializers.FloatField()
    duration_seconds = serializers.FloatField()
    maneuver = ManeuverSerializer()
    geometry = GeometrySerializer()


class RouteResponseSerializer(serializers.Serializer):
    origin = SnappedCoordinateSerializer()
    destination = SnappedCoordinateSerializer()
    distance_meters = serializers.FloatField()
    duration_seconds = serializers.FloatField()
    edge_count = serializers.IntegerField()
    geometry = GeometrySerializer()
    steps = RouteStepSerializer(many=True)


class SearchQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=200)


class SearchResultSerializer(CoordinateSerializer):
    id = serializers.CharField()
    label = serializers.CharField()
    category = serializers.CharField(allow_null=True)
    type = serializers.CharField(allow_null=True)
