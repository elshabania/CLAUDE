"""transit_line_integrity on mini fixtures."""

from __future__ import annotations

import pandas as pd
import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "transit_line_integrity"


def test_clean_line_has_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_sequence_gap_after_removed_segment() -> None:
    t = mini_tables()
    seg = t["transit_segments"]
    seg = seg[seg["seq"] != 2].copy()
    seg["seq"] = [1, 2, 3]  # seq 2 now starts at node 3 while seq 1 ends at node 2
    t["transit_segments"] = seg
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Critical"
    assert f.evidence.values["issue"] == "broken_sequence"
    assert f.evidence.values["sequence_gaps"] == 1
    assert f.evidence.values["segments_without_link"] == 0
    assert f.location.type.value == "line" and f.location.id == "B1"
    assert f.evidence.sources[0].table == "transit_segments"


def test_segment_with_no_road_link() -> None:
    t = mini_tables()
    seg = t["transit_segments"]
    seg.loc[seg["seq"] == 1, "to_node"] = 9  # 1 -> 9 is not a link
    seg.loc[seg["seq"] == 2, "from_node"] = 9  # keep the sequence contiguous
    seg.loc[seg["seq"] == 2, "to_node"] = 3
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    v = fs[0].evidence.values
    assert v["issue"] == "broken_sequence"
    assert v["segments_without_link"] == 2 and v["sequence_gaps"] == 0
    assert v["example_segments"][0] == {"seq": 1, "from": 1, "to": 9}


def test_node_not_in_network() -> None:
    t = mini_tables()
    seg = t["transit_segments"]
    seg.loc[seg["seq"] == 2, "to_node"] = 999
    seg.loc[seg["seq"] == 3, "from_node"] = 999
    fs = {f.evidence.values["issue"]: f for f in run_check(CHECK, t)}
    assert "node_not_in_network" in fs
    f = fs["node_not_in_network"]
    assert f.severity.value == "Critical"
    assert f.evidence.values["missing_nodes"] == [999]
    assert f.evidence.values["n_segments"] == 2
    assert f.location.id == "B1"


def test_headway_out_of_range() -> None:
    t = mini_tables()
    tl = t["transit_lines"]
    tl.loc[(tl["line_id"] == "B1") & (tl["period"] == "AM"), "headway_min"] = 240.0
    tl.loc[(tl["line_id"] == "B1") & (tl["period"] == "PM"), "headway_min"] = 1.0
    fs = {f.evidence.period: f for f in run_check(CHECK, t)}
    assert set(fs) == {"AM", "PM"}
    assert all(f.severity.value == "High" for f in fs.values())
    assert fs["AM"].evidence.values["headway_min"] == 240.0
    assert fs["AM"].evidence.thresholds["mode_max_headway_min"] == 120
    assert "above" in fs["AM"].executive_line and "below" in fs["PM"].executive_line
    assert fs["AM"].evidence.sources[0].column == "headway_min"
    assert fs["AM"].finding_id != fs["PM"].finding_id


def test_mode_specific_headway_maximum() -> None:
    t = mini_tables()
    tl = t["transit_lines"]
    metro = tl.iloc[[0]].copy()
    metro[["line_id", "mode", "headway_min"]] = ["M1", "METRO", 25.0]
    t["transit_lines"] = pd.concat([tl, metro], ignore_index=True)
    fs = run_check(CHECK, t)
    assert [(f.location.id, f.evidence.values["mode"]) for f in fs] == [("M1", "METRO")]
    assert fs[0].evidence.thresholds["mode_max_headway_min"] == 20
