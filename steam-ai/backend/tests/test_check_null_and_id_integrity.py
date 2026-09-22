"""null_and_id_integrity on mini fixtures."""

from __future__ import annotations

import pandas as pd
import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "null_and_id_integrity"


def test_clean_data_has_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_null_in_required_column() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 1, "capacity_vph"] = None
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "High"  # 1/16 > 1%
    assert f.location.type.value == "link" and f.location.id == "1"
    v = f.evidence.values
    assert (v["table"], v["column"], v["null_rows"], v["rows"]) == ("links", "capacity_vph", 1, 16)
    assert v["example_ids"] == [1]
    assert f.evidence.sources[0].file == "links.csv" and f.evidence.sources[0].row == 1
    assert f.evidence.sources[0].column == "capacity_vph"
    assert "IS NULL" in f.evidence.query
    assert "capacity_vph" in f.executive_line and "links" in f.executive_line


def test_small_null_share_is_medium() -> None:
    t = mini_tables()
    lf = pd.concat([t["link_flows"]] * 4, ignore_index=True)  # 128 rows
    lf["source_row"] = range(1, len(lf) + 1)
    lf.loc[0, "volume"] = None  # 1/128 < 1%
    t["link_flows"] = lf
    fs = run_check(CHECK, t)
    assert [f.severity.value for f in fs] == ["Medium"]
    assert fs[0].evidence.values["null_share"] < 0.01


def test_link_end_node_missing() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 1, "a_node"] = 999
    fs = [f for f in run_check(CHECK, t) if f.evidence.values["issue"] == "missing_node_refs"]
    assert len(fs) == 1 and fs[0].severity.value == "Critical"
    assert fs[0].evidence.values["example_ids"] == [1]
    assert fs[0].evidence.values["example_nodes"] == [999]
    assert fs[0].location.id == "1"


def test_land_use_and_od_zone_refs() -> None:
    t = mini_tables()
    t["land_use"].loc[t["land_use"].index[0], "zone_id"] = 99
    t["od"].loc[t["od"].index[0], "origin"] = 98
    fs = {f.evidence.values["table"]: f for f in run_check(CHECK, t)
          if f.evidence.values["issue"] == "missing_zone_refs"}
    assert set(fs) == {"land_use", "od"}
    assert fs["land_use"].severity.value == "Critical"
    assert fs["land_use"].evidence.values["example_ids"] == [99]
    assert fs["od"].evidence.values["example_ids"] == [98]
    assert fs["land_use"].location.type.value == "zone"


def test_flow_for_unknown_link() -> None:
    t = mini_tables()
    lf = t["link_flows"]
    lf.loc[lf["link_id"] == 1, "link_id"] = 777
    fs = [f for f in run_check(CHECK, t) if f.evidence.values["issue"] == "missing_link_refs"]
    assert len(fs) == 1 and fs[0].severity.value == "High"
    assert fs[0].evidence.values["missing_link_refs"] == 1
    assert fs[0].evidence.values["rows"] == 2
    assert fs[0].evidence.sources[0].table == "link_flows"


def test_finding_ids_are_stable_across_runs() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 1, "capacity_vph"] = None
    a = run_check(CHECK, t, run_id="one")
    b = run_check(CHECK, t, run_id="two")
    assert a[0].finding_id == b[0].finding_id
    assert a[0].run_id == "one" and b[0].run_id == "two"
