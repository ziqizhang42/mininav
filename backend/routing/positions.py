from array import array
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class NodePositions:
    """Node positions in flat arrays, addressed by the graph's dense index.

    One entry per graph node, in graph index order, so an estimate reads a
    position with an array index rather than searching for an OSM id. Indexes
    past the end belong to the synthetic nodes a single request invents, which
    have no position of their own; a reader is expected to check the length
    itself, as `build_travel_time_heuristic` does.
    """

    x: array
    y: array
    z: array


def empty_positions(node_count: int) -> NodePositions:
    """Allocate room for one position per node, all at the earth's centre."""
    return NodePositions(
        x=array("d", [0.0]) * node_count,
        y=array("d", [0.0]) * node_count,
        z=array("d", [0.0]) * node_count,
    )
