"""Standalone fake run for testing the report generator.

Sets ``STEAM_AI_DATA`` to a temporary directory (before ``steam_ai.paths`` is
used) and writes a small, fully deterministic run: manifest, a few internal
tables and the derived artefacts the report reads (health, findings, KPIs,
check results). Nothing here depends on the ingester or the checks.
"""

from __future__ import annotations

import importlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

RUN_ID = "fx_report_001"
LON0, LAT0 = 54.40, 24.45
STEP = 0.01  # degrees between grid nodes
GRID = 5  # 5 x 5 nodes


def _node_id(i: int, j: int) -> int:
    return 100 + i * GRID + j


def _nodes() -> pd.DataFrame:
    rows = []
    for i in range(GRID):
        for j in range(GRID):
            rows.append(
                {
                    "node_id": _node_id(i, j),
                    "x": LON0 + i * STEP,
                    "y": LAT0 + j * STEP,
                    "is_centroid": False,
                    "junction_control": "SIGNAL" if (i + j) % 2 == 0 else "PRIORITY",
                    "source_file": "nodes.csv",
                    "source_row": len(rows) + 2,
                }
            )
    # two centroids off-grid
    rows.append(
        {
            "node_id": 900,
            "x": LON0 + 0.5 * STEP,
            "y": LAT0 + 0.5 * STEP,
            "is_centroid": True,
            "junction_control": "NONE",
            "source_file": "nodes.csv",
            "source_row": len(rows) + 2,
        }
    )
    rows.append(
        {
            "node_id": 901,
            "x": LON0 + 3.5 * STEP,
            "y": LAT0 + 3.5 * STEP,
            "is_centroid": True,
            "junction_control": "NONE",
            "source_file": "nodes.csv",
            "source_row": len(rows) + 2,
        }
    )
    return pd.DataFrame(rows)


def _links(nodes: pd.DataFrame) -> pd.DataFrame:
    xy = {int(r.node_id): (float(r.x), float(r.y)) for r in nodes.itertuples()}
    rows = []
    link_id = 0
    # class by link id: 1 FWY, 7 FWY, 15 FWY, 22 COL, 31 FWY (matches the fixture findings)
    classes = ["ART", "FWY", "COL", "FWY"]
    for i in range(GRID):
        for j in range(GRID):
            pairs = []
            if i + 1 < GRID:
                pairs.append((_node_id(i, j), _node_id(i + 1, j)))
            if j + 1 < GRID:
                pairs.append((_node_id(i, j), _node_id(i, j + 1)))
            for a, b in pairs:
                link_id += 1
                cls = classes[link_id % 4]
                cap = {"FWY": 6000.0, "ART": 3000.0, "COL": 1500.0}[cls]
                (x1, y1), (x2, y2) = xy[a], xy[b]
                length = 1110.0 if x1 == x2 else 1020.0
                rows.append(
                    {
                        "link_id": link_id,
                        "a_node": a,
                        "b_node": b,
                        "length_m": length,
                        "link_class": cls,
                        "area_type": "URB" if i < 3 else "SUB",
                        "lanes": 3 if cls == "FWY" else 2,
                        "capacity_vph": cap if link_id != 15 else 0.0,
                        "ffs_kph": {"FWY": 100.0, "ART": 60.0, "COL": 40.0}[cls],
                        "oneway": True,
                        "toll_point": False,
                        "junction_type": "SIGNAL" if cls != "FWY" else "NONE",
                        "sector_id": "S1" if i < 3 else "S2",
                        "geometry_wkt": f"LINESTRING({x1:.5f} {y1:.5f}, {x2:.5f} {y2:.5f})",
                        "source_file": "links.csv",
                        "source_row": link_id + 1,
                    }
                )
    # two centroid connectors
    for cid, (a, b) in enumerate(((900, _node_id(0, 0)), (901, _node_id(3, 3))), start=1):
        link_id += 1
        (x1, y1), (x2, y2) = xy[a], xy[b]
        rows.append(
            {
                "link_id": link_id,
                "a_node": a,
                "b_node": b,
                "length_m": 780.0 if cid == 1 else 6200.0,
                "link_class": "CONN",
                "area_type": "URB",
                "lanes": 1,
                "capacity_vph": 9999.0,
                "ffs_kph": 30.0,
                "oneway": False,
                "toll_point": False,
                "junction_type": "NONE",
                "sector_id": "S1",
                "geometry_wkt": f"LINESTRING({x1:.5f} {y1:.5f}, {x2:.5f} {y2:.5f})",
                "source_file": "links.csv",
                "source_row": link_id + 1,
            }
        )
    return pd.DataFrame(rows)


def _link_flows(links: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    rows = []
    row_no = 2
    for period, scale in (("AM", 1.0), ("PM", 0.9)):
        for r in links.itertuples():
            vc = float(np.clip(rng.normal(0.62 * scale, 0.22), 0.05, 1.05))
            if period == "AM" and r.link_id == 7:
                vc = 1.42
            if period == "PM" and r.link_id == 22:
                vc = 1.18
            if period == "AM" and r.link_id == 31:
                vc = 0.97
            cap = r.capacity_vph if r.capacity_vph > 0 else 3000.0
            vol = vc * cap * 3.0
            speed = max(5.0, r.ffs_kph * (1.0 - 0.6 * min(vc, 1.3) / 1.3))
            time_s = r.length_m / 1000.0 / speed * 3600.0
            delay = max(0.0, time_s - r.length_m / 1000.0 / r.ffs_kph * 3600.0)
            rows.append(
                {
                    "link_id": r.link_id,
                    "period": period,
                    "user_class": "ALL",
                    "volume": round(vol, 1),
                    "vc_ratio": round(vc, 3),
                    "cong_time_s": round(time_s, 1),
                    "cong_speed_kph": round(speed, 1),
                    "delay_s": round(delay, 1),
                    "source_file": "link_flows.csv",
                    "source_row": row_no,
                }
            )
            row_no += 1
    return pd.DataFrame(rows)


def _convergence() -> pd.DataFrame:
    rows = []
    row_no = 2
    for period, floor in (("AM", 0.0004), ("PM", 0.005)):
        for it in range(1, 21):
            gap = max(floor, 0.2 * (0.65**it))
            rows.append(
                {
                    "stage": "HWY_ASSIGN",
                    "period": period,
                    "iteration": it,
                    "metric": "REL_GAP",
                    "value": gap,
                    "source_file": "convergence.csv",
                    "source_row": row_no,
                }
            )
            row_no += 1
    return pd.DataFrame(rows)


def _finding(
    fid: str,
    check_id: str,
    check_name: str,
    severity: str,
    loc: dict,
    exec_line: str,
    modeller: str,
    values: dict,
    thresholds: dict,
    sources: list[dict],
    cause: str,
    action: str,
    measures: list[dict] | None = None,
    period: str | None = None,
    significant: bool = True,
) -> dict:
    return {
        "finding_id": fid,
        "run_id": RUN_ID,
        "check_id": check_id,
        "check_name": check_name,
        "severity": severity,
        "location": loc,
        "executive_line": exec_line,
        "modeller_view": modeller,
        "evidence": {
            "values": values,
            "thresholds": thresholds,
            "sources": sources,
            "period": period,
            "query": None,
        },
        "likely_cause": cause,
        "suggested_action": action,
        "measures": measures or [],
        "is_significant": significant,
        "created_at": "2026-09-20T08:00:00+00:00",
    }


def _link_loc(links: pd.DataFrame, link_id: int) -> dict:
    r = links.loc[links.link_id == link_id].iloc[0]
    wkt = r.geometry_wkt[len("LINESTRING(") : -1]
    pts = [tuple(float(v) for v in p.split()) for p in wkt.split(",")]
    lon = sum(p[0] for p in pts) / len(pts)
    lat = sum(p[1] for p in pts) / len(pts)
    return {
        "type": "link",
        "id": str(link_id),
        "label": f"Link {link_id} ({r.link_class})",
        "lon": lon,
        "lat": lat,
    }


def _findings(links: pd.DataFrame) -> list[dict]:
    lvo = ("link_volume_outliers", "Link volume outliers")
    src = lambda f, row: {"file": f, "row": row, "table": None, "column": None}  # noqa: E731
    return [
        _finding(
            "f-crit-001",
            *lvo,
            "Critical",
            _link_loc(links, 7),
            "Link 7 carries 42% more traffic than its capacity in the AM peak.",
            "vc_ratio = 1.42 for link 7, period AM, user_class ALL; class threshold 1.30 "
            "(config/checks.yaml link_volume_outliers.vc_critical).",
            {"vc_ratio": 1.42, "volume": 25560, "capacity_vph": 6000},
            {"vc_critical": 1.30},
            [src("link_flows.csv", 8), src("links.csv", 8)],
            "Capacity coded too low for a three-lane freeway, or a missing parallel link.",
            "Check lanes and capacity_vph on link 7 against the network coding guide.",
            [
                {
                    "measure_id": "m-001",
                    "title": "Recode capacity to 3 lanes",
                    "description": "Raise capacity_vph from 6000 to 6600 (2200 per lane).",
                    "estimated_effect": "V/C falls to about 1.29",
                    "effect_values": {"vc_ratio_after": 1.29},
                    "method": "sketch_elasticity",
                    "confidence": "medium",
                },
                {
                    "measure_id": "m-002",
                    "title": "Add missing parallel arterial",
                    "description": "Code the parallel arterial shown in the base network.",
                    "estimated_effect": None,
                    "effect_values": {},
                    "method": "not_computable",
                    "confidence": "low",
                },
            ],
            period="AM",
        ),
        _finding(
            "f-crit-002",
            "network_connectivity",
            "Network connectivity",
            "Critical",
            _link_loc(links, 15),
            "Link 15 has zero capacity, so no traffic can use it.",
            "capacity_vph = 0 on link 15 (links.csv row 16); min_capacity_vph = 1.0.",
            {"capacity_vph": 0.0, "issue": "zero_capacity"},
            {"min_capacity_vph": 1.0},
            [src("links.csv", 16)],
            "Capacity field left blank during network edit.",
            "Set capacity_vph for link 15 from the link class default.",
            [
                {
                    "measure_id": "m-003",
                    "title": "Restore capacity from class default",
                    "description": "Set capacity_vph to 6000 (FWY default).",
                    "estimated_effect": "Removes the blocked link",
                    "effect_values": {},
                    "method": "not_computable",
                    "confidence": "high",
                }
            ],
        ),
        _finding(
            "f-high-001",
            *lvo,
            "High",
            _link_loc(links, 22),
            "Link 22 is 18% over capacity in the PM peak.",
            "vc_ratio = 1.18 for link 22, period PM, user_class ALL; threshold 1.10.",
            {"vc_ratio": 1.18, "volume": 5310, "capacity_vph": 1500},
            {"vc_high": 1.10},
            [src("link_flows.csv", 71)],
            "Collector coded with one lane fewer than the base network.",
            "Compare lanes on link 22 with the base run.",
            [
                {
                    "measure_id": "m-004",
                    "title": "Add one lane on link 22",
                    "description": "Raise capacity_vph to 2250.",
                    "estimated_effect": "V/C falls to about 0.79",
                    "effect_values": {"vc_ratio_after": 0.79},
                    "method": "surrogate",
                    "confidence": "low",
                }
            ],
            period="PM",
        ),
        _finding(
            "f-high-002",
            "convergence_and_noise",
            "Convergence and noise",
            "High",
            {"type": "run", "id": RUN_ID, "label": "PM assignment", "lon": None, "lat": None},
            "The PM highway assignment stopped before reaching the convergence target.",
            "Final REL_GAP = 0.005 at iteration 20 for HWY_ASSIGN PM; target 0.001, high 0.01.",
            {"rel_gap": 0.005, "iteration": 20},
            {"rel_gap_target": 0.001, "rel_gap_high": 0.01},
            [src("convergence.csv", 41)],
            "Iteration limit reached before the gap target.",
            "Raise the PM iteration limit or tighten the step-size rule.",
            [
                {
                    "measure_id": "m-005",
                    "title": "Raise PM iteration limit to 40",
                    "description": "Rerun the PM assignment with 40 iterations.",
                    "estimated_effect": None,
                    "effect_values": {},
                    "method": "steam_rerun",
                    "confidence": "medium",
                }
            ],
            period="PM",
        ),
        _finding(
            "f-high-003",
            "centroid_connectors",
            "Centroid connectors",
            "High",
            _link_loc(links, 41),
            "A zone connector joins the network directly onto a freeway.",
            "Connector link 41 attaches to node 100, which carries FWY link 1; "
            "high_class_links = [FWY, EXP].",
            {"issue": "connector_on_high_class", "attached_link_class": "FWY"},
            {"high_class_links": "FWY, EXP"},
            [src("links.csv", 42), src("links.csv", 2)],
            "Connector snapped to the nearest node without checking link class.",
            "Move the connector to the adjacent arterial node.",
            [
                {
                    "measure_id": "m-006",
                    "title": "Reattach connector to arterial",
                    "description": "Attach link 41 to node 101 instead of node 100.",
                    "estimated_effect": None,
                    "effect_values": {},
                    "method": "not_computable",
                    "confidence": "medium",
                }
            ],
        ),
        _finding(
            "f-med-001",
            *lvo,
            "Medium",
            _link_loc(links, 31),
            "Link 31 is close to capacity in the AM peak.",
            "vc_ratio = 0.97 for link 31, period AM; medium threshold 0.95.",
            {"vc_ratio": 0.97},
            {"vc_medium": 0.95},
            [src("link_flows.csv", 32)],
            "Expected under the forecast demand; worth a look.",
            "No action unless the link is on a screenline.",
            period="AM",
        ),
        _finding(
            "f-med-002",
            "centroid_connectors",
            "Centroid connectors",
            "Medium",
            _link_loc(links, 42),
            "A zone connector is 6.2 km long, more than the 5 km limit.",
            "length_m = 6200 on connector link 42; max_connector_length_m = 5000.",
            {"length_m": 6200.0},
            {"max_connector_length_m": 5000},
            [src("links.csv", 43)],
            "Zone centroid placed far from the loaded network.",
            "Split the zone or add a loading point closer to the centroid.",
        ),
        _finding(
            "f-med-003",
            "matrix_sanity",
            "Matrix sanity",
            "Medium",
            {"type": "zone", "id": "12", "label": "Zone 12", "lon": 54.415, "lat": 24.455},
            "Zone 12 keeps 21% of its trips inside the zone, above the 15% limit.",
            "intrazonal share = 0.21 for zone 12, HBW CAR AM; intrazonal_share_max = 0.15.",
            {"intrazonal_share": 0.21, "purpose": "HBW", "mode": "CAR"},
            {"intrazonal_share_max": 0.15},
            [src("od.csv", None)],
            "Large zone with mixed land use.",
            "Review zone size; consider splitting.",
            period="AM",
        ),
        _finding(
            "f-med-004",
            "unrealistic_speeds_times",
            "Unrealistic speeds and times",
            "Medium",
            _link_loc(links, 7),
            "Delay on link 7 exceeds 15 minutes in the AM peak.",
            "delay_s = 1020 on link 7 AM; max_delay_s = 900.",
            {"delay_s": 1020.0},
            {"max_delay_s": 900},
            [src("link_flows.csv", 8)],
            "Follows from the over-capacity flow on the same link.",
            "Resolve the capacity finding on link 7 first.",
            period="AM",
        ),
        _finding(
            "f-info-001",
            "matrix_sanity",
            "Matrix sanity",
            "Info",
            {"type": "matrix", "id": "HBW_CAR_AM", "label": "HBW CAR AM", "lon": None, "lat": None},
            "The HBW car AM matrix contains small fractional cells.",
            "1240 cells below 0.01 trips in HBW CAR AM DEMAND.",
            {"cells_below_0_01": 1240},
            {},
            [src("od.csv", None)],
            "Normal output of the doubly-constrained balancing.",
            "No action.",
            period="AM",
        ),
        _finding(
            "f-info-002",
            "matrix_sanity",
            "Matrix sanity",
            "Info",
            {"type": "matrix", "id": "HBO_PT_PM", "label": "HBO PT PM", "lon": None, "lat": None},
            "The HBO PT PM matrix contains small fractional cells.",
            "860 cells below 0.01 trips in HBO PT PM DEMAND.",
            {"cells_below_0_01": 860},
            {},
            [src("od.csv", None)],
            "Normal output of the doubly-constrained balancing.",
            "No action.",
            period="PM",
        ),
        _finding(
            "f-info-003",
            *lvo,
            "Info",
            _link_loc(links, 3),
            "Link 3 flow moved slightly between the last iterations; within the noise band.",
            "Change of 2.1% between iterations 19 and 20 is inside the noise band (3.0%).",
            {"change_share": 0.021},
            {"noise_band_share": 0.03},
            [src("iteration_flows.csv", None)],
            "Assignment noise.",
            "No action.",
            period="AM",
            significant=False,
        ),
    ]


def _check_results(findings: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for f in findings:
        counts[f["check_id"]] = counts.get(f["check_id"], 0) + 1
    spec = [
        (
            "null_and_id_integrity",
            "Null and ID integrity",
            "ok",
            "No missing references.",
            0.12,
            200,
        ),
        ("network_connectivity", "Network connectivity", "ok", None, 0.31, 42),
        ("centroid_connectors", "Centroid connectors", "ok", None, 0.05, 2),
        (
            "transit_line_integrity",
            "Transit line integrity",
            "skipped",
            "transit_lines table not present",
            0.0,
            0,
        ),
        (
            "land_use_control_totals",
            "Land use control totals",
            "skipped",
            "control_totals table not present",
            0.0,
            0,
        ),
        ("link_volume_outliers", "Link volume outliers", "ok", None, 0.44, 84),
        (
            "convergence_and_noise",
            "Convergence and noise",
            "ok",
            "PM did not reach the relative gap target.",
            0.09,
            40,
        ),
        ("matrix_sanity", "Matrix sanity", "ok", None, 1.8, 40000),
        (
            "trip_length_distribution",
            "Trip length distribution",
            "error",
            "no base run to compare against",
            0.01,
            0,
        ),
        ("unrealistic_speeds_times", "Unrealistic speeds and times", "ok", None, 0.2, 84),
        ("parameter_drift", "Parameter drift", "skipped", "parameters table not present", 0.0, 0),
        ("unexplained_demand_shift", "Unexplained demand shift", "skipped", "no base run", 0.0, 0),
        (
            "unused_transit_services",
            "Unused transit services",
            "skipped",
            "line_loads table not present",
            0.0,
            0,
        ),
    ]
    return [
        {
            "check_id": cid,
            "check_name": name,
            "status": status,
            "message": msg,
            "duration_s": dur,
            "rows_examined": rows,
            "n_findings": counts.get(cid, 0),
        }
        for cid, name, status, msg, dur, rows in spec
    ]


def _health(findings: list[dict]) -> dict:
    sig = [f for f in findings if f["is_significant"]]
    counts = {
        s: sum(1 for f in findings if f["severity"] == s)
        for s in ("Critical", "High", "Medium", "Info")
    }
    pen = {"Critical": 25, "High": 8, "Medium": 2, "Info": 0}
    fc = max(0.0, 100.0 - sum(pen[f["severity"]] for f in sig))
    # PM rel gap 0.005: 1 - (0.005 - 0.001) / (0.01 - 0.001)
    cc = 100.0 * (1.0 - (0.005 - 0.001) / 0.009)
    score = 0.7 * fc + 0.3 * cc
    grade = (
        "A"
        if score >= 90
        else "B"
        if score >= 75
        else "C"
        if score >= 60
        else ("D" if score >= 40 else "E")
    )
    return {
        "run_id": RUN_ID,
        "score": round(score, 1),
        "grade": grade,
        "components": [
            {
                "name": "findings",
                "score": round(fc, 1),
                "weight": 0.7,
                "detail": "2 Critical, 3 High, 4 Medium significant findings",
            },
            {
                "name": "convergence",
                "score": round(cc, 1),
                "weight": 0.3,
                "detail": "PM final relative gap 0.005 against a target of 0.001",
            },
        ],
        "counts": counts,
        "definition": (
            "Health = 0.7 x Findings component + 0.3 x Convergence component. "
            "Findings component = max(0, 100 - 25 x Critical - 8 x High - 2 x Medium - 0 x Info), "
            "counting significant findings only. Convergence component = 100 if every "
            "assignment period met the relative gap target, scaled down linearly to 0 at ten "
            "times the target. Grade: A >= 90, B >= 75, C >= 60, D >= 40, E below 40."
        ),
    }


def _kpis(links: pd.DataFrame, flows: pd.DataFrame) -> list[dict]:
    am = flows[(flows.period == "AM") & (flows.user_class == "ALL")].merge(
        links[["link_id", "length_m"]], on="link_id"
    )
    vkt = float((am.volume * am.length_m / 1000.0).sum())
    share = float((am.loc[am.volume > 0, "vc_ratio"] > 1.0).mean())
    speed = float((am.volume * am.cong_speed_kph).sum() / am.volume.sum())
    src = [{"file": "link_flows.csv", "row": None, "table": "link_flows", "column": None}]
    return [
        {
            "kpi_id": "total_vkt_am",
            "name": "Vehicle-km travelled, AM",
            "value": vkt,
            "unit": "veh-km",
            "period": "AM",
            "definition": "Sum of link volume x length for user_class ALL in the AM period.",
            "sources": src,
        },
        {
            "kpi_id": "share_links_over_capacity_am",
            "name": "Share of links with V/C above 1.0, AM",
            "value": share,
            "unit": "share",
            "period": "AM",
            "definition": "Links with vc_ratio > 1.0 divided by all links carrying flow, AM, "
            "user_class ALL.",
            "sources": src,
        },
        {
            "kpi_id": "mean_cong_speed_am",
            "name": "Volume-weighted congested speed, AM",
            "value": speed,
            "unit": "km/h",
            "period": "AM",
            "definition": "Sum(volume x congested speed) / Sum(volume) for AM, user_class ALL.",
            "sources": src,
        },
    ]


def write_fixture_run(data_root: Path, run_id: str = RUN_ID, synthetic: bool = True) -> str:
    """Write the fake run under ``data_root/runs/<run_id>`` and return the run id.

    ``STEAM_AI_DATA`` must already point at ``data_root`` and ``steam_ai.paths``
    must have been (re)loaded, so that ``steam_ai.store.write_table`` lands there.
    """
    from steam_ai import store as store_mod

    run_path = data_root / "runs" / run_id
    run_path.mkdir(parents=True, exist_ok=True)
    nodes = _nodes()
    links = _links(nodes)
    flows = _link_flows(links)
    conv = _convergence()
    tables = {
        "nodes": store_mod.write_table(run_id, "nodes", nodes),
        "links": store_mod.write_table(run_id, "links", links),
        "link_flows": store_mod.write_table(run_id, "link_flows", flows),
        "convergence": store_mod.write_table(run_id, "convergence", conv),
    }
    manifest = {
        "run_id": run_id,
        "scenario_name": "Fixture scenario",
        "horizon_year": 2035,
        "policy_set": "REF",
        "base_run_id": None,
        "ingested_at": datetime(2026, 9, 20, 7, 30, tzinfo=timezone.utc).isoformat(),
        "source_root": "/fixtures/steam_export",
        "steam_version": "v4.0-fixture",
        "is_synthetic": synthetic,
        "status": "checked",
        "files": [
            {"path": "links.csv", "size": 4096, "sha256": "0" * 64, "table": "links"},
            {"path": "nodes.csv", "size": 1024, "sha256": "1" * 64, "table": "nodes"},
            {"path": "link_flows.csv", "size": 8192, "sha256": "2" * 64, "table": "link_flows"},
            {"path": "convergence.csv", "size": 512, "sha256": "3" * 64, "table": "convergence"},
        ],
        "tables": tables,
        "periods": ["AM", "PM"],
    }
    (run_path / "manifest.json").write_text(json.dumps(manifest, indent=2), "utf-8")
    derived = run_path / "derived"
    derived.mkdir(exist_ok=True)
    findings = _findings(links)
    (derived / "findings.json").write_text(json.dumps(findings, indent=2), "utf-8")
    (derived / "check_results.json").write_text(
        json.dumps(_check_results(findings), indent=2), "utf-8"
    )
    (derived / "health.json").write_text(json.dumps(_health(findings), indent=2), "utf-8")
    (derived / "kpis.json").write_text(json.dumps(_kpis(links, flows), indent=2), "utf-8")
    return run_id


def point_data_root(monkeypatch: pytest.MonkeyPatch, data_root: Path) -> None:
    """Point STEAM_AI_DATA at ``data_root`` and reload ``steam_ai.paths``."""
    monkeypatch.setenv("STEAM_AI_DATA", str(data_root))
    import steam_ai.paths

    importlib.reload(steam_ai.paths)


@pytest.fixture
def report_data_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "data"
    root.mkdir()
    point_data_root(monkeypatch, root)
    return root


@pytest.fixture
def report_store(report_data_root: Path):
    from steam_ai.store import RunStore

    run_id = write_fixture_run(report_data_root)
    store = RunStore(run_id)
    yield store
    store.close()
