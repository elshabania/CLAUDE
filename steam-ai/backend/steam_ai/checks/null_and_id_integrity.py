"""Nulls in required columns and dangling identifiers between tables."""

from __future__ import annotations

from typing import Any

from ..models import Finding, Location, LocationType, Severity
from ..store import RunStore
from .base import (
    Check,
    evaluate_severity,
    fmt,
    link_locations,
    make_finding,
    node_locations,
    pct,
    refs_from_rows,
    zone_locations,
)

_ENTITY = {
    "links": (LocationType.LINK, "link_id"),
    "nodes": (LocationType.NODE, "node_id"),
    "zones": (LocationType.ZONE, "zone_id"),
    "land_use": (LocationType.ZONE, "zone_id"),
    "link_flows": (LocationType.LINK, "link_id"),
    "od": (LocationType.ZONE, "origin"),
    "transit_lines": (LocationType.LINE, "line_id"),
    "transit_segments": (LocationType.LINE, "line_id"),
    "line_loads": (LocationType.LINE, "line_id"),
}

_EXAMPLES = 20


class NullAndIdIntegrity(Check):
    check_id = "null_and_id_integrity"
    name = "Null values and identifier integrity"
    description = (
        "Required columns must be populated, and every identifier must resolve: link end "
        "nodes to nodes, land-use and demand zone ids to zones, assigned flows to links."
    )
    required_tables = {"links", "nodes", "zones"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        findings: list[Finding] = []
        self.rows_examined = 0
        findings += self._nulls(store, params, severity_rules)
        findings += self._link_node_refs(store, severity_rules)
        for table in ("land_use", "od"):
            if store.has(table):
                findings += self._zone_refs(store, table, severity_rules)
        if store.has("link_flows"):
            findings += self._flow_link_refs(store, severity_rules)
        return findings

    # --- nulls ----------------------------------------------------------------------
    def _nulls(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        out: list[Finding] = []
        required: dict[str, list[str]] = params.get("required_columns", {})
        for table, columns in required.items():
            if not store.has(table) or not columns:
                continue
            counts_sql = "SELECT COUNT(*) AS n, " + ", ".join(
                f'COUNT(*) FILTER (WHERE "{c}" IS NULL) AS "{c}"' for c in columns
            ) + f" FROM {table}"
            counts = store.query(counts_sql).iloc[0]
            n = int(counts["n"])
            self.rows_examined += n
            if n == 0:
                continue
            loc_type, id_col = _ENTITY.get(table, (LocationType.RUN, None))
            for col in columns:
                n_null = int(counts[col])
                if n_null == 0:
                    continue
                null_share = n_null / n
                sev = evaluate_severity(rules, null_share=null_share, issue="null_values",
                                        table=table, column=col)
                if sev is None:
                    continue
                ex_sql = (
                    f'SELECT {id_col + ", " if id_col else ""}source_file, source_row '
                    f'FROM {table} WHERE "{col}" IS NULL LIMIT {_EXAMPLES}'
                    if "source_row" in _cols(store, table)
                    else f'SELECT {id_col + ", " if id_col else ""}source_file FROM {table} '
                    f'WHERE "{col}" IS NULL LIMIT {_EXAMPLES}'
                )
                ex = store.query(ex_sql)
                examples = [_py(v) for v in ex[id_col].tolist()] if id_col else []
                location = _location_for(store, loc_type, examples)
                out.append(
                    make_finding(
                        run_id=store.run_id,
                        check=self,
                        severity=sev,
                        location=location,
                        executive_line=(
                            f"{fmt(n_null)} of {fmt(n)} rows in the {table} table "
                            f"({pct(null_share, 1)}) have no value for {col}."
                        ),
                        likely_cause=(
                            "Export mapping dropped the column for some records, or the "
                            "network/matrix file has blank attributes."
                        ),
                        suggested_action=(
                            f"Fill or default {col} in the source file and re-export; "
                            "downstream checks skip rows with nulls."
                        ),
                        values={"table": table, "column": col, "null_rows": n_null,
                                "rows": n, "null_share": null_share,
                                "example_ids": examples, "issue": "null_values"},
                        thresholds={"null_share_high": 0.01, "null_share_medium": 0.0},
                        sources=refs_from_rows(ex, table, col),
                        query=ex_sql,
                        discriminator=f"{table}.{col}",
                        method="COUNT(*) FILTER (WHERE column IS NULL) per required column",
                    )
                )
        return out

    # --- dangling references ------------------------------------------------------
    def _link_node_refs(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = (
            "SELECT l.link_id, l.a_node, l.b_node, l.source_file, l.source_row, "
            "CASE WHEN na.node_id IS NULL THEN 'a_node' ELSE 'b_node' END AS which "
            "FROM links l LEFT JOIN nodes na ON na.node_id = l.a_node "
            "LEFT JOIN nodes nb ON nb.node_id = l.b_node "
            "WHERE na.node_id IS NULL OR nb.node_id IS NULL ORDER BY l.link_id"
        )
        df = store.query(sql)
        n = len(df)
        if n == 0:
            return []
        sev = evaluate_severity(rules, missing_node_refs=n, issue="missing_node_refs")
        if sev is None:
            return []
        examples = [int(v) for v in df["link_id"].head(_EXAMPLES).tolist()]
        return [
            make_finding(
                run_id=store.run_id,
                check=self,
                severity=sev,
                location=_location_for(store, LocationType.LINK, examples),
                executive_line=(
                    f"{fmt(n)} road links refer to a node that does not exist in the network."
                ),
                likely_cause="Nodes were deleted or renumbered without updating the link file.",
                suggested_action="Restore the missing nodes or fix the link end-node ids.",
                values={"missing_node_refs": n, "example_ids": examples,
                        "example_nodes": [int(v) for v in df["a_node"].where(
                            df["which"] == "a_node", df["b_node"]).head(_EXAMPLES)],
                        "issue": "missing_node_refs"},
                thresholds={"missing_node_refs": 0},
                sources=refs_from_rows(df, "links", "a_node/b_node"),
                query=sql,
                discriminator="links.node_refs",
                method="LEFT JOIN links to nodes on a_node and b_node",
            )
        ]

    def _zone_refs(self, store: RunStore, table: str, rules: list[dict[str, Any]]) -> list[Finding]:
        if table == "land_use":
            sql = (
                "SELECT t.zone_id, t.source_file, t.source_row FROM land_use t "
                "LEFT JOIN zones z USING (zone_id) WHERE z.zone_id IS NULL ORDER BY t.zone_id"
            )
        else:
            sql = (
                "SELECT DISTINCT zone_id, source_file FROM ("
                "SELECT o.origin AS zone_id, o.source_file FROM od o "
                "LEFT JOIN zones z ON z.zone_id = o.origin WHERE z.zone_id IS NULL "
                "UNION ALL SELECT o.destination, o.source_file FROM od o "
                "LEFT JOIN zones z ON z.zone_id = o.destination WHERE z.zone_id IS NULL"
                ") ORDER BY zone_id"
            )
        df = store.query(sql)
        n = len(df)
        if n == 0:
            return []
        sev = evaluate_severity(rules, missing_zone_refs=n, issue="missing_zone_refs")
        if sev is None:
            return []
        examples = [int(v) for v in df["zone_id"].head(_EXAMPLES).tolist()]
        noun = "land-use records" if table == "land_use" else "demand matrix zone ids"
        return [
            make_finding(
                run_id=store.run_id,
                check=self,
                severity=sev,
                location=Location(type=LocationType.ZONE, id=str(examples[0]),
                                  label=f"{table}: {n} unknown zone ids (e.g. {examples[0]})"),
                executive_line=f"{fmt(n)} {noun} point to zones missing from the zone system.",
                likely_cause="Zone system and inputs come from different zoning versions.",
                suggested_action="Align the zone file with the land-use and matrix zone ids.",
                values={"table": table, "missing_zone_refs": n, "example_ids": examples,
                        "issue": "missing_zone_refs"},
                thresholds={"missing_zone_refs": 0},
                sources=refs_from_rows(df, table, "zone_id"),
                query=sql,
                discriminator=f"{table}.zone_refs",
                method="LEFT JOIN to zones on zone id",
            )
        ]

    def _flow_link_refs(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = (
            "SELECT f.link_id, f.period, f.source_file, f.source_row FROM link_flows f "
            "LEFT JOIN links l USING (link_id) WHERE l.link_id IS NULL ORDER BY f.link_id"
        )
        df = store.query(sql)
        n = len(df)
        if n == 0:
            return []
        n_links = int(df["link_id"].nunique())
        sev = evaluate_severity(rules, missing_link_refs=n_links, issue="missing_link_refs")
        if sev is None:
            return []
        examples = [int(v) for v in df["link_id"].drop_duplicates().head(_EXAMPLES).tolist()]
        return [
            make_finding(
                run_id=store.run_id,
                check=self,
                severity=sev,
                location=Location(type=LocationType.LINK, id=str(examples[0]),
                                  label=f"link_flows: {n_links} unknown links (e.g. {examples[0]})"),
                executive_line=(
                    f"Assigned flows exist for {fmt(n_links)} links that are not in the network."
                ),
                likely_cause="Flow export and network export come from different runs.",
                suggested_action="Re-export flows and network from the same run directory.",
                values={"missing_link_refs": n_links, "rows": n, "example_ids": examples,
                        "issue": "missing_link_refs"},
                thresholds={"missing_link_refs": 0},
                sources=refs_from_rows(df, "link_flows", "link_id"),
                query=sql,
                discriminator="link_flows.link_refs",
                method="LEFT JOIN link_flows to links on link_id",
            )
        ]


def _cols(store: RunStore, table: str) -> list[str]:
    return [c for c in store.query(f"SELECT * FROM {table} LIMIT 0").columns]


def _py(v: Any) -> Any:
    return v.item() if hasattr(v, "item") else v


def _location_for(store: RunStore, loc_type: LocationType, examples: list[Any]) -> Location:
    """Location pointing at the first offending entity, labelled with the count."""
    if not examples:
        return Location(type=LocationType.RUN, id=store.run_id, label="Whole model")
    first = examples[0]
    try:
        if loc_type == LocationType.LINK:
            return link_locations(store, [first]).get(int(first)) or Location(
                type=loc_type, id=str(first))
        if loc_type == LocationType.NODE:
            return node_locations(store, [first]).get(int(first)) or Location(
                type=loc_type, id=str(first))
        if loc_type == LocationType.ZONE:
            return zone_locations(store, [first]).get(int(first)) or Location(
                type=loc_type, id=str(first))
    except (TypeError, ValueError):
        pass
    return Location(type=loc_type, id=str(first), label=str(first))


__all__ = ["NullAndIdIntegrity", "Severity"]
