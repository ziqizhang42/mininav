from collections.abc import Mapping


def permitted_directions(tags: Mapping[str, str]) -> tuple[bool, bool]:
    """Return (forward_allowed, backward_allowed)."""

    oneway = tags.get("oneway", "").lower()

    if oneway in {"yes", "1", "true"}:
        return True, False

    if oneway == "-1":
        return False, True

    if oneway in {"no", "0", "false"}:
        return True, True

    if tags.get("junction") == "roundabout":
        return True, False

    return True, True
