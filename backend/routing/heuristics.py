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
    costed at no more than the top speed.

    The argument is a dense graph node index, not an OSM id, so the position is
    a direct array read. A request's synthetic nodes sit past the end of the
    arrays and fall back to zero, which is admissible.
    The destination node is exactly the point being measured to.
    """
    goal_x, goal_y, goal_z = earth_centred_position(goal_longitude, goal_latitude)
    seconds_per_meter = 1 / top_speed_meters_per_second

    x = positions.x
    y = positions.y
    z = positions.z
    limit = len(x)

    def heuristic(index: int) -> float:
        if index >= limit:
            return 0.0

        dx = x[index] - goal_x
        dy = y[index] - goal_y
        dz = z[index] - goal_z

        return sqrt(dx * dx + dy * dy + dz * dz) * seconds_per_meter

    return heuristic
