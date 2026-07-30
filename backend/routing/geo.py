from math import atan2, cos, radians, sin, sqrt

EARTH_RADIUS_METERS = 6_371_008.8


def earth_centred_position(
    longitude: float,
    latitude: float,
) -> tuple[float, float, float]:
    """Return a position in metres on a sphere centred on the earth.

    The straight line between two such positions cuts through the sphere, so it
    is always a little shorter than traveling over the surface.
    A cheap understatement of `distance_meters`.
    """
    longitude_radians = radians(longitude)
    latitude_radians = radians(latitude)
    latitude_cosine = cos(latitude_radians)

    return (
        EARTH_RADIUS_METERS * latitude_cosine * cos(longitude_radians),
        EARTH_RADIUS_METERS * latitude_cosine * sin(longitude_radians),
        EARTH_RADIUS_METERS * sin(latitude_radians),
    )


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
