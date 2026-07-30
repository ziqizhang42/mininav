from array import array
from dataclasses import dataclass

# Ids travel in integer arrays and fields, so "no OSM way here" and "no OSM node
# here" need values rather than None. Real OSM ids are always positive.
NO_WAY_ID = -1
NO_NODE_ID = 0


@dataclass(frozen=True, slots=True)
class Edge:
    id: int
    source: int
    target: int
    cost: float
    osm_way_id: int | None = None


# An edge list per node, keyed by OSM node id.
# `compile_graph` turns it into the form the search actually walks.
Adjacency = dict[int, list[Edge]]


@dataclass(frozen=True, slots=True)
class RoadGraph:
    """The routing graph in flat arrays, addressed by a dense node index.

    Nodes are numbered 0 to `node_count - 1`, so a search can keep its
    bookkeeping in `array`s indexed by node instead of dicts keyed on OSM ids.
    An array store beats hashing a 64-bit id, and there is no per-edge Python object to attribute-access.

    Adjacency is compressed sparse row. The edges leaving node `index` occupy
    the slots `offsets[index]` up to `offsets[index + 1]`, and every per-edge
    array is read at that slot. So walking a node's edges is a `range` over
    integers, with no list to build.
    """

    # Both directions of the OSM id <-> dense index mapping.
    index_of: dict[int, int]
    node_ids: array  # 'q'

    offsets: array  # 'i', node_count + 1 entries
    sources: array  # 'i', one per slot
    targets: array  # 'i', one per slot
    costs: array  # 'd', one per slot
    edge_ids: array  # 'q', one per slot
    way_ids: array  # 'q', one per slot, NO_WAY_ID where the way is unknown

    @property
    def node_count(self) -> int:
        return len(self.node_ids)

    @property
    def edge_count(self) -> int:
        return len(self.targets)


def compile_graph(adjacency: Adjacency) -> RoadGraph:
    """Build a `RoadGraph` from an edge list per node.

    Every node an edge touches is given an index, whether or not the adjacency
    named it as a key, so a graph written with only its sources listed still
    routes into its leaves.
    """
    node_ids = sorted(
        {
            node_id
            for source, edges in adjacency.items()
            for node_id in (source, *(edge.target for edge in edges))
        }
    )
    index_of = {node_id: index for index, node_id in enumerate(node_ids)}
    node_count = len(node_ids)
    edge_count = sum(len(edges) for edges in adjacency.values())

    offsets = array("i", [0]) * (node_count + 1)
    sources = array("i", [0]) * edge_count
    targets = array("i", [0]) * edge_count
    costs = array("d", [0.0]) * edge_count
    edge_ids = array("q", [0]) * edge_count
    way_ids = array("q", [0]) * edge_count

    cursor = 0

    for index, node_id in enumerate(node_ids):
        offsets[index] = cursor

        for edge in adjacency.get(node_id, ()):
            sources[cursor] = index
            targets[cursor] = index_of[edge.target]
            costs[cursor] = edge.cost
            edge_ids[cursor] = edge.id
            way_ids[cursor] = NO_WAY_ID if edge.osm_way_id is None else edge.osm_way_id
            cursor += 1

    offsets[node_count] = cursor

    return RoadGraph(
        index_of=index_of,
        node_ids=array("q", node_ids),
        offsets=offsets,
        sources=sources,
        targets=targets,
        costs=costs,
        edge_ids=edge_ids,
        way_ids=way_ids,
    )


tiny_adjacency: Adjacency = {
    1: [
        Edge(id=1, source=1, target=2, cost=10),
        Edge(id=2, source=1, target=3, cost=2),
    ],
    2: [
        Edge(id=3, source=2, target=4, cost=1),
    ],
    3: [
        Edge(id=4, source=3, target=2, cost=3),
        Edge(id=5, source=3, target=4, cost=20),
    ],
    4: [],
}

tiny_graph = compile_graph(tiny_adjacency)
