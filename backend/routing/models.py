from django.contrib.gis.db import models


class RoadNode(models.Model):
    osm_id = models.BigIntegerField(primary_key=True)
    location = models.PointField(srid=4326)

    class Meta:
        db_table = "road_nodes"


class RoadEdge(models.Model):
    osm_way_id = models.BigIntegerField()
    segment_index = models.PositiveIntegerField()

    source = models.ForeignKey(
        RoadNode,
        on_delete=models.DO_NOTHING,
        related_name="+",
        db_column="source_node_id",
    )

    target = models.ForeignKey(
        RoadNode,
        on_delete=models.DO_NOTHING,
        related_name="+",
        db_column="target_node_id",
    )

    geometry = models.LineStringField(srid=4326)
    length_meters = models.FloatField()
    cost_seconds = models.FloatField()

    road_class = models.CharField(max_length=32)
    name = models.CharField(max_length=255, null=True)
    tags = models.JSONField(default=dict)

    class Meta:
        db_table = "road_edges"
        indexes = [
            models.Index(fields=["osm_way_id"], name="road_edges_way_idx"),
            models.Index(
                fields=["osm_way_id", "segment_index", "source", "target"],
                name="road_edges_reverse_idx",
            ),
        ]


class TurnRestriction(models.Model):
    osm_relation_id = models.BigIntegerField(primary_key=True)
    restriction = models.CharField(max_length=64)
    from_way_id = models.BigIntegerField()
    via_node_id = models.BigIntegerField()
    to_way_id = models.BigIntegerField()
    tags = models.JSONField(default=dict)

    class Meta:
        db_table = "turn_restrictions"
        indexes = [
            models.Index(
                fields=["from_way_id", "via_node_id", "to_way_id"],
                name="turn_restriction_lookup_idx",
            ),
        ]
