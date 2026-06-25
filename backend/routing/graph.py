from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Edge:
    id: int
    source: int
    target: int
    cost: float
    osm_way_id: int | None = None


Graph = dict[int, list[Edge]]

tiny_graph: Graph = {
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
