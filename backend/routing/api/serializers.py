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
    viewbox = serializers.CharField(required=False, max_length=100)
    focus = serializers.CharField(required=False, max_length=50)

    def validate_q(self, value):
        query = value.strip()

        if len(query) < 2:
            raise serializers.ValidationError(
                "Ensure this field has at least 2 non-whitespace characters."
            )

        return query

    def validate_viewbox(self, value):
        west, south, east, north = _parse_coordinate_tuple(
            value,
            expected_length=4,
            field_name="viewbox",
        )

        if not -180 <= west < east <= 180:
            raise serializers.ValidationError(
                "West and east must form a valid longitude range."
            )

        if not -90 <= south < north <= 90:
            raise serializers.ValidationError(
                "South and north must form a valid latitude range."
            )

        return west, south, east, north

    def validate_focus(self, value):
        longitude, latitude = _parse_coordinate_tuple(
            value,
            expected_length=2,
            field_name="focus",
        )

        if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
            raise serializers.ValidationError(
                "Focus must contain a valid longitude and latitude."
            )

        return longitude, latitude


class SearchResultSerializer(CoordinateSerializer):
    id = serializers.CharField()
    label = serializers.CharField()
    category = serializers.CharField(allow_null=True)
    type = serializers.CharField(allow_null=True)


def _parse_coordinate_tuple(value, *, expected_length, field_name):
    try:
        coordinates = tuple(float(part.strip()) for part in value.split(","))
    except ValueError as error:
        raise serializers.ValidationError(
            f"{field_name} must contain comma-separated numbers."
        ) from error

    if len(coordinates) != expected_length:
        raise serializers.ValidationError(
            f"{field_name} must contain {expected_length} comma-separated numbers."
        )

    return coordinates
