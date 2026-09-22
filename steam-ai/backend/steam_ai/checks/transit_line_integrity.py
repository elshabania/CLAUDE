"""Transit line integrity: segment/link consistency, sequence gaps, headways."""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..models import Finding, Location, LocationType
from ..store import RunStore
from .base import Check, evaluate_severity, fmt, make_finding, refs_from_rows

_EXAMPLES = 20


class TransitLineIntegrity(Check):
    check_id = "transit_line_integrity"
    name = "Transit line integrity"
    description = (
        "Each transit line must follow existing road links in an unbroken node sequence, "
        "use nodes that exist, and have a plausible headway for its mode."
    )
    required_tables = {"transit_lines", "transit_segments", "links", "nodes"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        self.rows_examined = store.row_count("transit_segments") + store.row_count(
            "transit_lines"
        )
        out: list[Finding] = []
        out += self._segments(store, severity_rules)
        out += self._headways(store, params, severity_rules)
        return out

    def _segments(self, store: RunStore, rules: list[dict[str, Any]]) -> list[Finding]:
        sql = """
            WITH edges AS (
                SELECT a_node AS f, b_node AS t FROM links
                UNION SELECT b_node, a_node FROM links
            ),
            seg AS (
                SELECT s.*,
                       LAG(s.seq) OVER (PARTITION BY s.line_id ORDER BY s.seq) AS prev_seq,
                       LAG(s.to_node) OVER (PARTITION BY s.line_id ORDER BY s.seq) AS prev_to
                FROM transit_segments s
            )
            SELECT s.line_id, s.seq, s.from_node, s.to_node, s.source_file, s.source_row,
                   e.f IS NULL AS no_link,
                   (s.prev_seq IS NOT NULL
                    AND (s.seq <> s.prev_seq + 1 OR s.from_node <> s.prev_to)) AS seq_gap,
                   nf.node_id IS NULL AS from_missing,
                   nt.node_id IS NULL AS to_missing
            FROM seg s
            LEFT JOIN edges e ON e.f = s.from_node AND e.t = s.to_node
            LEFT JOIN nodes nf ON nf.node_id = s.from_node
            LEFT JOIN nodes nt ON nt.node_id = s.to_node
            WHERE e.f IS NULL OR nf.node_id IS NULL OR nt.node_id IS NULL
               OR (s.prev_seq IS NOT NULL AND (s.seq <> s.prev_seq + 1 OR s.from_node <> s.prev_to))
            ORDER BY s.line_id, s.seq
        """
        df = store.query(sql)
        if df.empty:
            return []
        out: list[Finding] = []
        for line_id, g in df.groupby("line_id", sort=True):
            missing_nodes = g[g["from_missing"] | g["to_missing"]]
            if not missing_nodes.empty:
                sev = evaluate_severity(rules, issue="node_not_in_network")
                if sev is not None:
                    nodes = sorted(
                        {int(v) for v in missing_nodes.loc[missing_nodes["from_missing"],
                                                           "from_node"]}
                        | {int(v) for v in missing_nodes.loc[missing_nodes["to_missing"],
                                                             "to_node"]}
                    )
                    out.append(
                        make_finding(
                            run_id=store.run_id, check=self, severity=sev,
                            location=_line_loc(str(line_id)),
                            executive_line=f"Transit line {line_id} passes through "
                            f"{fmt(len(nodes))} node(s) that do not exist in the network.",
                            likely_cause="Line file references nodes removed or renumbered in "
                            "the network edit.",
                            suggested_action="Re-route the line through existing nodes or "
                            "restore the nodes.",
                            values={"issue": "node_not_in_network",
                                    "missing_nodes": nodes[:_EXAMPLES],
                                    "n_segments": int(len(missing_nodes))},
                            thresholds={},
                            sources=refs_from_rows(missing_nodes, "transit_segments",
                                                   "from_node/to_node"),
                            query=sql, discriminator="node_not_in_network",
                            method="segments anti-joined to nodes",
                        )
                    )
            # Missing links only count when both nodes exist (otherwise it is the node issue)
            broken = g[(g["no_link"] & ~(g["from_missing"] | g["to_missing"])) | g["seq_gap"]]
            if not broken.empty:
                sev = evaluate_severity(rules, issue="broken_sequence")
                if sev is not None:
                    n_nolink = int((broken["no_link"] & ~(broken["from_missing"]
                                                          | broken["to_missing"])).sum())
                    n_gap = int(broken["seq_gap"].sum())
                    parts = []
                    if n_nolink:
                        parts.append(f"{n_nolink} segment(s) with no road link")
                    if n_gap:
                        parts.append(f"{n_gap} break(s) in the stop sequence")
                    out.append(
                        make_finding(
                            run_id=store.run_id, check=self, severity=sev,
                            location=_line_loc(str(line_id)),
                            executive_line=f"Transit line {line_id} is broken: "
                            + " and ".join(parts) + ".",
                            likely_cause="A link the line used was deleted or re-noded, or "
                            "segments were re-ordered when the itinerary was edited.",
                            suggested_action="Fix the itinerary so consecutive segments share "
                            "a node and each pair of nodes is joined by a link.",
                            values={"issue": "broken_sequence", "segments_without_link":
                                    n_nolink, "sequence_gaps": n_gap,
                                    "example_segments": [
                                        {"seq": int(r.seq), "from": int(r.from_node),
                                         "to": int(r.to_node)}
                                        for r in broken.head(_EXAMPLES).itertuples()]},
                            thresholds={},
                            sources=refs_from_rows(broken, "transit_segments", "seq"),
                            query=sql, discriminator="broken_sequence",
                            method="segments joined to undirected link edges; LAG over seq",
                        )
                    )
        return out

    def _headways(
        self, store: RunStore, params: dict[str, Any], rules: list[dict[str, Any]]
    ) -> list[Finding]:
        lo, hi = [float(x) for x in params.get("headway_min_range", [2, 120])]
        mode_max: dict[str, float] = {
            str(k): float(v) for k, v in (params.get("modes_headway_max") or {}).items()
        }
        sql = (
            "SELECT line_id, mode, period, headway_min, vehicle_capacity, source_file, source_row "
            "FROM transit_lines WHERE headway_min IS NOT NULL ORDER BY line_id, period"
        )
        df = store.query(sql)
        if df.empty:
            return []
        df["mode_max"] = df["mode"].map(mode_max)
        bad = df[
            (df["headway_min"] < lo)
            | (df["headway_min"] > hi)
            | (df["mode_max"].notna() & (df["headway_min"] > df["mode_max"]))
        ]
        out: list[Finding] = []
        for r in bad.itertuples():
            sev = evaluate_severity(rules, issue="headway_out_of_range",
                                    headway_min=r.headway_min, mode=r.mode)
            if sev is None:
                continue
            limit = min(hi, r.mode_max) if not pd.isna(r.mode_max) else hi
            if r.headway_min < lo:
                why = f"below the {fmt(lo)} minute minimum"
            else:
                why = f"above the {fmt(limit)} minute maximum for {r.mode}"
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=_line_loc(str(r.line_id), r.mode),
                    executive_line=f"Line {r.line_id} ({r.mode}) runs every "
                    f"{fmt(r.headway_min)} minutes in {_plabel(r.period)}, {why}.",
                    likely_cause="Headway coded in the wrong unit (seconds or vehicles per "
                    "hour) or a placeholder value left in the line file.",
                    suggested_action="Correct the headway in the line file; a typical "
                    f"{r.mode} service runs every {fmt(lo)}-{fmt(limit)} minutes.",
                    values={"issue": "headway_out_of_range", "headway_min": r.headway_min,
                            "mode": r.mode, "vehicle_capacity": r.vehicle_capacity},
                    thresholds={"headway_min_range": [lo, hi],
                                "mode_max_headway_min": None if pd.isna(r.mode_max)
                                else float(r.mode_max)},
                    sources=refs_from_rows(bad[(bad["line_id"] == r.line_id)
                                               & (bad["period"] == r.period)],
                                           "transit_lines", "headway_min"),
                    query=sql, period=None if pd.isna(r.period) else str(r.period),
                    discriminator="headway_out_of_range",
                    method="headway range and per-mode maximum",
                )
            )
        return out


def _line_loc(line_id: str, mode: str | None = None) -> Location:
    label = f"Line {line_id}" + (f" ({mode})" if mode else "")
    return Location(type=LocationType.LINE, id=line_id, label=label)


def _plabel(period: Any) -> str:
    from .base import period_label

    return period_label(None if pd.isna(period) else str(period))
