from collections.abc import Callable
from math import sqrt

from routing.geo import earth_centred_position
from routing.positions import NodePositions


def build_travel_time_heuristic(
    positions: NodePositions,
    top_speed_meters_per_second: float,
    goal_longitude: float,
    goal_latitude: float,
) -> Callable[[int], float]:
    """Estimate the seconds still needed to reach a goal coordinate.

    The estimate is the straight line to the goal covered at the fastest speed
    anywhere on the network, so it can never exceed the real driving time: a
    route is at least as long as the straight line, and every edge of it is
    costed at no more than the top speed. Nodes without a known position fall back to zero.
    """
    goal_x, goal_y, goal_z = earth_centred_position(goal_longitude, goal_latitude)
    seconds_per_meter = 1 / top_speed_meters_per_second

    # The search asks about a node barely more than once, so no need to memoising the estimate.
    lookup = positions.get

    def heuristic(node: int) -> float:
        position = lookup(node)

        if position is None:
            return 0.0

        x, y, z = position
        x -= goal_x
        y -= goal_y
        z -= goal_z

        return sqrt(x * x + y * y + z * z) * seconds_per_meter

    return heuristic
