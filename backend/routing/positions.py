from array import array
from bisect import bisect_left
from dataclasses import dataclass
from typing import Protocol

Position = tuple[float, float, float]


class NodePositions(Protocol):
    def get(self, node_id: int, /) -> Position | None: ...


@dataclass(frozen=True, slots=True)
class PackedNodePositions:
    """Node positions kept in flat arrays (instead of an object per node).

    `node_ids` must be sorted, and holds one entry per node. `coordinates`
    holds three entries per node, in the same order.
    """

    node_ids: array
    coordinates: array

    def get(self, node_id: int, /) -> Position | None:
        node_ids = self.node_ids
        index = bisect_left(node_ids, node_id)

        if index == len(node_ids) or node_ids[index] != node_id:
            return None

        coordinates = self.coordinates
        offset = index * 3

        return (
            coordinates[offset],
            coordinates[offset + 1],
            coordinates[offset + 2],
        )
