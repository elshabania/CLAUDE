"""Tiny hand-made run fixtures for unit-testing the checks without the synthetic generator.

The clean network is a 3x3 grid of road nodes (1..9) with a freeway through the
middle row (4-5-6), four zones whose centroids (101..104) hang off the corner
nodes via connectors, one bus line, flows for AM and PM, a demand matrix, skims,
convergence records, iteration flows and a parameter register. Tests copy the
clean tables, plant a defect, and write a run with :func:`make_run`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from steam_ai import paths
from steam_ai.models import RunManifest
from steam_ai.store import RunStore, write_table

PERIODS = ["AM", "PM"]
HOURS = {"AM": 3.0, "PM": 3.0}


def _node(node_id: int, col: int, row: int, centroid: bool = False) -> dict:
    return {
        "node_id": node_id,
        "x": 54.0 + col * 0.01,
        "y": 24.0 + row * 0.01,
        "is_centroid": centroid,
        "junction_control": "NONE",
        "source_file": "nodes.csv",
        "source_row": node_id,
    }


def _link(
    link_id: int,
    a: int,
    b: int,
    cls: str,
    nodes: dict[int, tuple[float, float]],
    sector: str,
    oneway: bool = False,
) -> dict:
    spec = {
        "FWY": (3, 6000.0, 100.0),
        "ART": (2, 2000.0, 60.0),
        "COL": (1, 900.0, 50.0),
        "CONN": (1, 9999.0, 40.0),
    }[cls]
    (ax, ay), (bx, by) = nodes[a], nodes[b]
    length = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 * 100_000.0  # ~ metres at this latitude
    return {
        "link_id": link_id,
        "a_node": a,
        "b_node": b,
        "length_m": round(length if length > 0 else 500.0, 1),
        "link_class": cls,
        "area_type": "URB",
        "lanes": spec[0],
        "capacity_vph": spec[1],
        "ffs_kph": spec[2],
        "oneway": oneway,
        "toll_point": False,
        "junction_type": "NONE",
        "sector_id": sector,
        "geometry_wkt": f"LINESTRING ({ax} {ay}, {bx} {by})",
        "source_file": "links.csv",
        "source_row": link_id,
    }


def mini_tables() -> dict[str, pd.DataFrame]:
    """Return the clean set of internal tables (fresh copies every call)."""
    nodes_rows = []
    node_xy: dict[int, tuple[float, float]] = {}
    nid = 1
    for row in range(3):
        for col in range(3):
            n = _node(nid, col, row)
            nodes_rows.append(n)
            node_xy[nid] = (n["x"], n["y"])
            nid += 1
    # centroids near the corners (node 1 = bottom-left, 3 = bottom-right, 7 top-left, 9 top-right)
    for cid, (col, row) in zip([101, 102, 103, 104], [(-0.5, -0.5), (2.5, -0.5), (-0.5, 2.5),
                                                       (2.5, 2.5)]):
        n = _node(cid, 0, 0, centroid=True)
        n["x"] = 54.0 + col * 0.01
        n["y"] = 24.0 + row * 0.01
        nodes_rows.append(n)
        node_xy[cid] = (n["x"], n["y"])

    def sector_of(a: int, b: int) -> str:
        return "S1" if (node_xy[a][0] + node_xy[b][0]) / 2 < 54.01 else "S2"

    links_rows = []
    lid = 1
    # horizontals: rows (1,2,3), (4,5,6), (7,8,9); middle row is the freeway
    for r0 in (1, 4, 7):
        for a in (r0, r0 + 1):
            cls = "FWY" if r0 == 4 else "ART"
            links_rows.append(_link(lid, a, a + 1, cls, node_xy, sector_of(a, a + 1)))
            lid += 1
    # verticals
    for c0 in (1, 2, 3):
        for a in (c0, c0 + 3):
            links_rows.append(_link(lid, a, a + 3, "ART", node_xy, sector_of(a, a + 3)))
            lid += 1
    # connectors: corners 1, 3, 7, 9 (none touch the freeway)
    for cid, road in zip([101, 102, 103, 104], [1, 3, 7, 9]):
        links_rows.append(_link(lid, cid, road, "CONN", node_xy, sector_of(road, road)))
        lid += 1
    links = pd.DataFrame(links_rows)
    nodes = pd.DataFrame(nodes_rows)

    zones = pd.DataFrame(
        [
            {
                "zone_id": z,
                "sector_id": "S1" if z in (1, 3) else "S2",
                "district": "D1",
                "region": "ABU",
                "geometry_wkt": None,
                "centroid_x": node_xy[100 + z][0],
                "centroid_y": node_xy[100 + z][1],
                "source_file": "zones.csv",
                "source_row": z,
            }
            for z in (1, 2, 3, 4)
        ]
    )
    lu_rows = []
    i = 1
    for z in (1, 2, 3, 4):
        for var, val in (("POP", 1000.0 * z), ("EMP_TOTAL", 500.0 * z)):
            lu_rows.append({"zone_id": z, "variable": var, "value": val,
                            "source_file": "land_use.csv", "source_row": i})
            i += 1
    land_use = pd.DataFrame(lu_rows)
    control_totals = pd.DataFrame(
        [
            {"variable": "POP", "region": "ALL", "value": 10000.0,
             "source_file": "control_totals.csv", "source_row": 1},
            {"variable": "EMP_TOTAL", "region": "ALL", "value": 5000.0,
             "source_file": "control_totals.csv", "source_row": 2},
            {"variable": "POP", "region": "ABU", "value": 10000.0,
             "source_file": "control_totals.csv", "source_row": 3},
        ]
    )

    transit_lines = pd.DataFrame(
        [
            {"line_id": "B1", "mode": "BUS", "operator": "ITC", "period": p,
             "headway_min": 10.0, "fare_ref": "F1", "vehicle_capacity": 80.0,
             "source_file": "transit_lines.csv", "source_row": k + 1}
            for k, p in enumerate(PERIODS)
        ]
    )
    seq_nodes = [1, 2, 3, 6, 9]
    transit_segments = pd.DataFrame(
        [
            {"line_id": "B1", "seq": k + 1, "from_node": a, "to_node": b, "is_stop": True,
             "source_file": "transit_segments.csv", "source_row": k + 1}
            for k, (a, b) in enumerate(zip(seq_nodes, seq_nodes[1:]))
        ]
    )
    line_loads = pd.DataFrame(
        [
            {"line_id": "B1", "seq": k + 1, "period": p, "load": 40.0, "boardings": 10.0,
             "alightings": 8.0, "crowding_factor": 0.5,
             "source_file": "line_loads.csv", "source_row": k + 1 + 10 * j}
            for j, p in enumerate(PERIODS)
            for k in range(4)
        ]
    )

    flow_rows = []
    r = 1
    for _, l in links.iterrows():
        for p in PERIODS:
            if l["link_class"] == "CONN":
                vol, vc = 500.0, 0.05
            else:
                vol = l["capacity_vph"] * HOURS[p] * 0.5
                vc = 0.5
            flow_rows.append(
                {"link_id": l["link_id"], "period": p, "user_class": "ALL", "volume": vol,
                 "vc_ratio": vc, "cong_time_s": l["length_m"] / (l["ffs_kph"] * 0.8) * 3.6,
                 "cong_speed_kph": l["ffs_kph"] * 0.8, "delay_s": 30.0,
                 "source_file": "link_flows.csv", "source_row": r}
            )
            r += 1
    link_flows = pd.DataFrame(flow_rows)

    od_rows, skim_rows = [], []
    for p in PERIODS:
        for mode in ("CAR", "PT"):
            for o in (1, 2, 3, 4):
                for d in (1, 2, 3, 4):
                    trips = 10.0 if o == d else (100.0 if mode == "CAR" else 40.0)
                    od_rows.append({"matrix_kind": "DEMAND", "purpose": "HBW", "mode": mode,
                                    "period": p, "origin": o, "destination": d, "trips": trips,
                                    "source_file": "od.csv"})
                    skim_rows.append({"skim_kind": "DIST", "mode": mode, "period": p,
                                      "origin": o, "destination": d,
                                      "value": 1.0 + abs(o - d) * 3.0, "source_file": "skims.csv"})
    od = pd.DataFrame(od_rows)
    skims = pd.DataFrame(skim_rows)

    conv_rows = []
    k = 1
    for p in PERIODS:
        for it, gap in enumerate([0.05, 0.01, 0.003, 0.001, 0.0005], start=1):
            conv_rows.append({"stage": "HWY_ASSIGN", "period": p, "iteration": it,
                              "metric": "REL_GAP", "value": gap,
                              "source_file": "convergence.csv", "source_row": k})
            k += 1
    convergence = pd.DataFrame(conv_rows)

    it_rows = []
    for _, f in link_flows.iterrows():
        for it, dv in ((3, -2.0), (4, 1.0), (5, 0.0)):
            it_rows.append({"link_id": f["link_id"], "period": f["period"], "iteration": it,
                            "volume": f["volume"] + dv, "source_file": "iteration_flows.csv"})
    iteration_flows = pd.DataFrame(it_rows)

    parameters = pd.DataFrame(
        [
            {"key": "VOT_CAR", "value": "1.5", "approved_value": "1.5",
             "source_file": "parameters.csv", "source_row": 1},
            {"key": "BPR_ALPHA", "value": "0.15", "approved_value": "0.15",
             "source_file": "parameters.csv", "source_row": 2},
            {"key": "RUN_NOTE", "value": "test", "approved_value": None,
             "source_file": "parameters.csv", "source_row": 3},
        ]
    )

    return {
        "links": links,
        "nodes": nodes,
        "zones": zones,
        "land_use": land_use,
        "control_totals": control_totals,
        "transit_lines": transit_lines,
        "transit_segments": transit_segments,
        "link_flows": link_flows,
        "line_loads": line_loads,
        "od": od,
        "skims": skims,
        "convergence": convergence,
        "parameters": parameters,
        "iteration_flows": iteration_flows,
    }


def make_run(
    run_id: str,
    tables: dict[str, pd.DataFrame],
    base_run_id: str | None = None,
    data_dir: Path | None = None,
) -> RunStore:
    """Write ``tables`` plus a manifest under the data root and open a RunStore."""
    if data_dir is not None:
        paths.DATA_DIR = Path(data_dir)
    rd = paths.run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    counts = {name: write_table(run_id, name, df.copy()) for name, df in tables.items()}
    manifest = RunManifest(
        run_id=run_id,
        scenario_name=f"mini {run_id}",
        horizon_year=2030,
        base_run_id=base_run_id,
        ingested_at=datetime.now(timezone.utc),
        source_root=str(rd),
        is_synthetic=True,
        files=[{"path": f"{n}.csv", "size": 0, "sha256": "", "table": n} for n in tables],
        tables=counts,
        periods=PERIODS,
    )
    (rd / "manifest.json").write_text(manifest.model_dump_json(indent=2), "utf-8")
    json.loads((rd / "manifest.json").read_text("utf-8"))  # sanity
    return RunStore(run_id)


@pytest.fixture
def mini_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the package data root at a temp dir for the duration of one test."""
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")
    return tmp_path / "data"
