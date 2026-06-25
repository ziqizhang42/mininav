import json
from collections import Counter
from itertools import pairwise
from pathlib import Path
from time import monotonic

import osmium
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from routing.access import permits_driving
from routing.costs import DRIVING_SPEEDS_KPH, driving_cost_seconds
from routing.directions import permitted_directions
from routing.geo import distance_meters
from routing.models import RoadEdge, RoadNode, TurnRestriction


class Command(BaseCommand):
    help = "Import compressed driving graph"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default="/data/osm/alberta-routing.osm.pbf",
        )

    def handle(self, *args, **options):
        file_path = Path(options["file"])

        if not file_path.exists():
            raise CommandError(f"File not found: {file_path}")

        started_at = monotonic()

        graph_nodes = self.find_graph_nodes(file_path)

        self.stdout.write(f"Found {len(graph_nodes):,} graph nodes")

        with transaction.atomic():
            self.stdout.write("Removing previous imported graph... ")

            # Preserve the negative ID development graph. Imported OSM IDs are positive.
            RoadEdge.objects.filter(osm_way_id__gt=0).delete()
            RoadNode.objects.filter(osm_id__gt=0).delete()
            TurnRestriction.objects.filter(osm_relation_id__gt=0).delete()

            node_count = self.copy_nodes(file_path, graph_nodes)

            if node_count != len(graph_nodes):
                raise CommandError(
                    f"Expected {len(graph_nodes):,} nodes, but copied {node_count:,}"
                )

            edge_count = self.copy_edges(file_path, graph_nodes)
            restriction_count = self.copy_turn_restrictions(file_path)

        with connection.cursor() as cursor:
            cursor.execute("ANALYZE road_nodes")
            cursor.execute("ANALYZE road_edges")
            cursor.execute("ANALYZE turn_restrictions")

        elapsed = monotonic() - started_at

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {node_count:,} nodes, "
                f"{edge_count:,} directed edges, and "
                f"{restriction_count:,} turn restrictions "
                f"in {elapsed:.1f} seconds"
            )
        )

    def find_graph_nodes(self, file_path: Path) -> set[int]:
        """Return usable way endpoints and shared nodes (required as graph vertices)."""
        self.stdout.write("Pass 1: finding intersections and endpoints... ")

        node_usage = Counter()
        graph_nodes = set()

        for way in self.ways(file_path):
            tags = self.driving_tags(way)

            if tags is None or len(way.nodes) < 2:
                continue

            node_ids = [node.ref for node in way.nodes]

            node_usage.update(node_ids)

            # Save first and last nodes always
            graph_nodes.add(node_ids[0])
            graph_nodes.add(node_ids[-1])

        for node_id, usage_count in node_usage.items():
            if usage_count > 1:
                # Save shared nodes
                graph_nodes.add(node_id)

        return graph_nodes

    def copy_nodes(self, file_path: Path, graph_nodes: set[int]) -> int:
        self.stdout.write("Pass 2: copying graph nodes...")

        processor = osmium.FileProcessor(file_path, osmium.osm.NODE).with_filter(
            osmium.filter.IdFilter(graph_nodes)
        )

        written = 0

        with connection.cursor() as cursor:
            with cursor.copy(
                """
                COPY road_nodes (osm_id, location)
                FROM STDIN
                """
            ) as copy:
                for node in processor:
                    location = f"SRID=4326;POINT({node.lon} {node.lat})"

                    copy.write_row((node.id, location))
                    written += 1

        self.stdout.write(f"Copied {written:,} nodes")

        return written

    def copy_edges(self, file_path: Path, graph_nodes: set[int]) -> int:
        self.stdout.write("Pass 3: copying compressed directed edges... ")

        processor = (
            osmium.FileProcessor(file_path)
            .with_locations("flex_mem")  # resolve coordinates for way node references
            .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        )

        written = 0
        next_progress = 100_000

        with connection.cursor() as cursor:
            with cursor.copy(
                """
                COPY road_edges (
                    osm_way_id,
                    segment_index,
                    geometry,
                    length_meters,
                    cost_seconds,
                    source_node_id,
                    target_node_id,
                    name,
                    road_class,
                    tags
                )
                FROM STDIN
                """
            ) as copy:
                for way in processor:
                    tags = self.driving_tags(way)

                    if tags is None or len(way.nodes) < 2:
                        continue

                    forward, reverse = permitted_directions(tags)
                    segment_start = 0
                    compressed_index = 0

                    # Split the way whenever the next retained graph node is reached
                    for end_index in range(1, len(way.nodes)):
                        target = way.nodes[end_index]

                        if target.ref not in graph_nodes:
                            continue

                        source = way.nodes[segment_start]
                        segment_nodes = [
                            way.nodes[index]
                            for index in range(segment_start, end_index + 1)
                        ]
                        segment_start = end_index

                        if source.ref == target.ref:
                            continue

                        coordinates = [(node.lon, node.lat) for node in segment_nodes]

                        length = self.segment_length(coordinates)

                        if length <= 0:
                            continue

                        forward_cost = driving_cost_seconds(
                            length, tags, direction="forward"
                        )
                        reverse_cost = driving_cost_seconds(
                            length, tags, direction="backward"
                        )

                        if forward_cost is None and reverse_cost is None:
                            continue

                        tags_json = json.dumps(tags, separators=(",", ":"))

                        if forward and forward_cost is not None:
                            self.write_edge(
                                copy=copy,
                                way=way,
                                segment_index=compressed_index,
                                source_id=source.ref,
                                target_id=target.ref,
                                coordinates=coordinates,
                                length=length,
                                cost=forward_cost,
                                tags=tags,
                                tags_json=tags_json,
                            )
                            written += 1

                        if reverse and reverse_cost is not None:
                            self.write_edge(
                                copy=copy,
                                way=way,
                                segment_index=compressed_index,
                                source_id=target.ref,
                                target_id=source.ref,
                                coordinates=list(reversed(coordinates)),
                                length=length,
                                cost=reverse_cost,
                                tags=tags,
                                tags_json=tags_json,
                            )
                            written += 1

                        compressed_index += 1

                    if written >= next_progress:
                        self.stdout.write(f"Copied {written:,} edges... ")
                        next_progress += 100_000

        return written

    def write_edge(
        self,
        *,
        copy,
        way,
        segment_index: int,
        source_id: int,
        target_id: int,
        coordinates: list[tuple[float, float]],
        length: float,
        cost: float,
        tags: dict[str, str],
        tags_json: str,
    ) -> None:
        coordinate_text = ",".join(
            f"{longitude} {latitude}" for longitude, latitude in coordinates
        )
        geometry = f"SRID=4326;LINESTRING({coordinate_text})"

        copy.write_row(
            (
                way.id,
                segment_index,
                geometry,
                length,
                cost,
                source_id,
                target_id,
                tags.get("name"),
                tags["highway"],
                tags_json,
            )
        )

    def segment_length(self, coordinates: list[tuple[float, float]]) -> float:
        return sum(
            distance_meters(
                start_longitude, start_latitude, end_longitude, end_latitude
            )
            for (
                (start_longitude, start_latitude),
                (end_longitude, end_latitude),
            ) in pairwise(coordinates)
        )

    def ways(self, file_path: Path):
        return osmium.FileProcessor(file_path, osmium.osm.WAY).with_filter(
            osmium.filter.EntityFilter(osmium.osm.WAY)
        )

    def driving_tags(self, way: osmium.osm.Way) -> dict[str, str] | None:
        tags = dict(way.tags)
        road_class = tags.get("highway")

        if road_class not in DRIVING_SPEEDS_KPH:
            return None

        if not permits_driving(tags):
            return None

        return tags

    def copy_turn_restrictions(self, file_path: Path) -> int:
        self.stdout.write("Pass 4: copying turn restrictions... ")

        processor = osmium.FileProcessor(
            file_path,
            osmium.osm.RELATION,
        ).with_filter(osmium.filter.EntityFilter(osmium.osm.RELATION))

        written = 0

        with connection.cursor() as cursor:
            with cursor.copy(
                """
                COPY turn_restrictions (
                    osm_relation_id,
                    restriction,
                    from_way_id,
                    via_node_id,
                    to_way_id,
                    tags
                )
                FROM STDIN
                """
            ) as copy:
                for relation in processor:
                    parsed = self.node_via_turn_restriction(relation)

                    if parsed is None:
                        continue

                    restriction, from_way_id, via_node_id, to_way_id, tags = parsed
                    tags_json = json.dumps(tags, separators=(",", ":"))

                    copy.write_row(
                        (
                            relation.id,
                            restriction,
                            from_way_id,
                            via_node_id,
                            to_way_id,
                            tags_json,
                        )
                    )
                    written += 1

        self.stdout.write(f"Copied {written:,} turn restrictions")

        return written

    def node_via_turn_restriction(
        self,
        relation: osmium.osm.Relation,
    ) -> tuple[str, int, int, int, dict[str, str]] | None:
        tags = dict(relation.tags)

        if tags.get("type") != "restriction":
            return None

        if "restriction:conditional" in tags and "restriction" not in tags:
            return None

        restriction = tags.get("restriction")

        if restriction is None:
            return None

        if not self.restriction_applies_to_driving(tags):
            return None

        from_way_ids = []
        via_node_ids = []
        to_way_ids = []

        for member in relation.members:
            if member.role == "from" and member.type == "w":
                from_way_ids.append(member.ref)
            elif member.role == "via" and member.type == "n":
                via_node_ids.append(member.ref)
            elif member.role == "to" and member.type == "w":
                to_way_ids.append(member.ref)

        if len(from_way_ids) != 1 or len(via_node_ids) != 1 or len(to_way_ids) != 1:
            return None

        return (
            restriction,
            from_way_ids[0],
            via_node_ids[0],
            to_way_ids[0],
            tags,
        )

    def restriction_applies_to_driving(self, tags: dict[str, str]) -> bool:
        exceptions = {
            value.strip()
            for value in tags.get("except", "").split(";")
            if value.strip()
        }

        return not exceptions.intersection({"motorcar", "motor_vehicle", "vehicle"})
