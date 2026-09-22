"""Centroid connectors attached to high-class roads or implausibly long."""

from __future__ import annotations

from typing import Any

from ..models import Finding
from ..store import RunStore
from .base import (
    Check,
    evaluate_severity,
    fmt,
    link_locations,
    make_finding,
    refs_from_rows,
    sql_str_list,
)


class CentroidConnectors(Check):
    check_id = "centroid_connectors"
    name = "Centroid connector placement"
    description = (
        "Connectors (link class CONN or any link touching a centroid) must not load traffic "
        "directly onto freeways or expressways, and must not be unrealistically long."
    )
    required_tables = {"links", "nodes"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        high = [str(c) for c in params.get("high_class_links", ["FWY", "EXP"])]
        conn_classes = [str(c) for c in params.get("connector_classes", ["CONN"])]
        max_len = float(params.get("max_connector_length_m", 5000))
        sql = f"""
            WITH conn AS (
                SELECT l.link_id, l.a_node, l.b_node, l.length_m, l.link_class,
                       l.source_file, l.source_row,
                       CASE WHEN COALESCE(na.is_centroid, FALSE) THEN l.b_node ELSE l.a_node END
                           AS street_node,
                       CASE WHEN COALESCE(na.is_centroid, FALSE) THEN l.a_node
                            WHEN COALESCE(nb.is_centroid, FALSE) THEN l.b_node END AS centroid
                FROM links l
                LEFT JOIN nodes na ON na.node_id = l.a_node
                LEFT JOIN nodes nb ON nb.node_id = l.b_node
                WHERE l.link_class IN ({sql_str_list(conn_classes)})
                   OR COALESCE(na.is_centroid, FALSE) OR COALESCE(nb.is_centroid, FALSE)
            ),
            touch AS (
                SELECT c.link_id, MIN(h.link_id) AS high_link, ANY_VALUE(h.link_class) AS high_class
                FROM conn c JOIN links h
                  ON (h.a_node = c.street_node OR h.b_node = c.street_node)
                 AND h.link_class IN ({sql_str_list(high)})
                GROUP BY c.link_id
            )
            SELECT c.*, t.high_link, t.high_class
            FROM conn c LEFT JOIN touch t USING (link_id)
            WHERE t.high_link IS NOT NULL OR c.length_m > {max_len}
            ORDER BY c.link_id
        """
        df = store.query(sql)
        self.rows_examined = int(store.scalar(
            f"SELECT COUNT(*) FROM links WHERE link_class IN ({sql_str_list(conn_classes)})"
        ) or 0)
        if df.empty:
            return []
        locs = link_locations(store, df["link_id"])
        out: list[Finding] = []
        for _, r in df.iterrows():
            lid = int(r["link_id"])
            refs = refs_from_rows(df[df["link_id"] == lid], "links", "link_id")
            if r["high_link"] is not None and not _isnan(r["high_link"]):
                sev = evaluate_severity(severity_rules, issue="connector_on_high_class",
                                        length_m=r["length_m"])
                if sev is not None:
                    out.append(
                        make_finding(
                            run_id=store.run_id, check=self, severity=sev, location=locs[lid],
                            executive_line=(
                                f"Connector {lid} loads zone traffic straight onto a "
                                f"{r['high_class']} link at node {int(r['street_node'])}."
                            ),
                            likely_cause="Connector snapped to the nearest node, which happens "
                            "to be on the freeway, rather than to a local street.",
                            suggested_action="Move the connector to a local or collector "
                            "street node near the zone centroid.",
                            values={"issue": "connector_on_high_class", "street_node":
                                    int(r["street_node"]), "high_class_link":
                                    int(r["high_link"]), "high_class": r["high_class"],
                                    "length_m": r["length_m"],
                                    "centroid": _int_or_none(r["centroid"])},
                            thresholds={"high_class_links": high},
                            sources=refs, query=sql,
                            discriminator="connector_on_high_class",
                            method="connector street-end node joined to links of high class",
                        )
                    )
            if r["length_m"] is not None and float(r["length_m"]) > max_len:
                sev = evaluate_severity(severity_rules, issue="connector_too_long",
                                        length_m=r["length_m"])
                if sev is not None:
                    out.append(
                        make_finding(
                            run_id=store.run_id, check=self, severity=sev, location=locs[lid],
                            executive_line=(
                                f"Connector {lid} is {fmt(r['length_m'] / 1000.0, 1)} km long, "
                                f"above the {fmt(max_len / 1000.0, 1)} km limit."
                            ),
                            likely_cause="Zone centroid far from the loaded network, or the "
                            "connector length was left at a default.",
                            suggested_action="Split the zone, add local streets, or connect "
                            "to a closer node.",
                            values={"issue": "connector_too_long", "length_m": r["length_m"],
                                    "centroid": _int_or_none(r["centroid"])},
                            thresholds={"max_connector_length_m": max_len},
                            sources=refs, query=sql,
                            discriminator="connector_too_long",
                            method="connector length_m above threshold",
                        )
                    )
        return out


def _isnan(v: Any) -> bool:
    try:
        return v != v
    except Exception:
        return False


def _int_or_none(v: Any) -> int | None:
    if v is None or _isnan(v):
        return None
    return int(v)
