"""network_connectivity on mini fixtures."""

from __future__ import annotations

import pandas as pd
import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "network_connectivity"


def _add_nodes(t: dict, ids: list[int], x: float = 54.05, y: float = 24.05) -> None:
    extra = t["nodes"].iloc[[0] * len(ids)].copy()
    extra["node_id"] = ids
    extra["x"] = x
    extra["y"] = y
    extra["is_centroid"] = False
    extra["source_row"] = [100 + i for i in range(len(ids))]
    t["nodes"] = pd.concat([t["nodes"], extra], ignore_index=True)


def _add_link(t: dict, link_id: int, a: int, b: int, oneway: bool = False) -> None:
    row = t["links"].iloc[[0]].copy()
    row["link_id"] = link_id
    row["a_node"] = a
    row["b_node"] = b
    row["oneway"] = oneway
    row["source_row"] = link_id
    t["links"] = pd.concat([t["links"], row], ignore_index=True)


def test_clean_network_has_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_orphan_node() -> None:
    t = mini_tables()
    _add_nodes(t, [50])
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Medium" and f.evidence.values["issue"] == "orphan_node"
    assert f.location.type.value == "node" and f.location.id == "50"
    assert f.location.lon == 54.05 and f.location.lat == 24.05
    assert f.evidence.sources[0].table == "nodes" and f.evidence.sources[0].row == 100


def test_orphan_centroid_is_not_reported() -> None:
    t = mini_tables()
    _add_nodes(t, [50])
    t["nodes"].loc[t["nodes"]["node_id"] == 50, "is_centroid"] = True
    assert run_check(CHECK, t) == []


def test_zero_capacity_and_zero_speed() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 2, "capacity_vph"] = 0.0
    t["links"].loc[t["links"]["link_id"] == 3, "ffs_kph"] = 2.0
    fs = {f.location.id: f for f in run_check(CHECK, t)}
    assert set(fs) == {"2", "3"}
    assert fs["2"].evidence.values["issue"] == "zero_capacity"
    assert fs["3"].evidence.values["issue"] == "zero_speed"
    assert all(f.severity.value == "Critical" for f in fs.values())
    assert fs["2"].evidence.thresholds["min_capacity_vph"] == 1.0
    assert fs["2"].location.lon is not None
    assert fs["2"].evidence.sources[0].column == "capacity_vph"


def test_oneway_dead_end() -> None:
    t = mini_tables()
    _add_nodes(t, [60])
    _add_link(t, 99, 5, 60, oneway=True)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    assert fs[0].evidence.values["issue"] == "oneway_dead_end"
    assert fs[0].severity.value == "High"
    assert fs[0].location.id == "60"
    assert fs[0].evidence.values["inbound_links"] == 1


def test_two_way_stub_is_not_a_dead_end() -> None:
    t = mini_tables()
    _add_nodes(t, [60])
    _add_link(t, 99, 5, 60, oneway=False)
    assert run_check(CHECK, t) == []


def test_disconnected_component() -> None:
    t = mini_tables()
    _add_nodes(t, [70, 71])
    _add_link(t, 98, 70, 71)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.evidence.values["issue"] == "disconnected_component"
    assert f.severity.value == "High"
    assert f.evidence.values["component_size"] == 2
    assert f.evidence.values["main_component_size"] == 13
    assert f.evidence.values["example_links"] == [98]
    assert f.location.id == "70" and "2 nodes" in f.executive_line


def _main_node_xy(t: dict) -> tuple[int, float, float]:
    nid = int(t["links"]["a_node"].iloc[0])
    row = t["nodes"].set_index("node_id").loc[nid]
    return nid, float(row["x"]), float(row["y"])


def test_fragment_on_top_of_main_node_is_node_id_mismatch() -> None:
    t = mini_tables()
    main_id, x, y = _main_node_xy(t)
    _add_nodes(t, [70], x=x, y=y)  # same point, different number
    _add_nodes(t, [71], x=x + 0.001, y=y)
    _add_link(t, 98, 70, 71)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    v = fs[0].evidence.values
    assert v["issue"] == "node_id_mismatch" and fs[0].severity.value == "High"
    assert v["fragment_node"] == 70 and v["nearest_main_node"] == main_id
    assert v["gap_to_main_m"] < 1.0
    assert f"Merge node 70 into node {main_id}" in fs[0].suggested_action


def test_fragment_near_main_network_reports_the_gap() -> None:
    t = mini_tables()
    main_id, x, y = _main_node_xy(t)
    _add_nodes(t, [70], x=x + 0.0002, y=y)  # ~20 m east
    _add_nodes(t, [71], x=x + 0.003, y=y)
    _add_link(t, 98, 70, 71)
    fs = run_check(CHECK, t)
    v = fs[0].evidence.values
    assert v["issue"] == "disconnected_component"
    assert 15 < v["gap_to_main_m"] < 25
    assert v["nearest_main_node"] == main_id
    assert "m from main-network node" in fs[0].executive_line
