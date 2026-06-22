from collections.abc import Mapping

DENIED_ACCESS_VALUES = {
    "no",
    "private",
    "agricultural",
    "forestry",
}


def permits_driving(tags: Mapping[str, str]) -> bool:
    for key in (
        "motorcar",
        "motor_vehicle",
        "vehicle",
        "access",
    ):
        value = tags.get(key)

        if value is not None:
            return value.lower() not in DENIED_ACCESS_VALUES

    return True
