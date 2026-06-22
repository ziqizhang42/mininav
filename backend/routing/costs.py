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


def driving_cost_seconds(distance: float, road_class: str) -> float | None:
    speed_kph = DRIVING_SPEEDS_KPH.get(road_class)

    if speed_kph is None:
        return None

    speed_meters_per_second = speed_kph / 3.6

    return distance / speed_meters_per_second
