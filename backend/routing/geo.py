from math import atan2, cos, radians, sin, sqrt

EARTH_RADIUS_METERS = 6_371_008.8


def distance_meters(
    start_longitude: float,
    start_latitude: float,
    end_longitude: float,
    end_latitude: float,
) -> float:
    start_latitude = radians(start_latitude)
    end_latitude = radians(end_latitude)
    latitude_difference = end_latitude - start_latitude
    longitude_difference = radians(end_longitude - start_longitude)

    a = (
        sin(latitude_difference / 2) ** 2
        + cos(start_latitude) * cos(end_latitude) * sin(longitude_difference / 2) ** 2
    )

    return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
