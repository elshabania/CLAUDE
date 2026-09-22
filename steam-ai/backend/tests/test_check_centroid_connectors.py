"""centroid_connectors on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "centroid_connectors"


def test_clean_connectors_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_connector_touching_freeway_node() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 13, "b_node"] = 4  # node 4 is on the FWY row
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "High"
    assert f.evidence.values["issue"] == "connector_on_high_class"
    assert f.location.type.value == "link" and f.location.id == "13"
    assert f.evidence.values["street_node"] == 4
    assert f.evidence.values["high_class"] == "FWY"
    assert f.evidence.values["centroid"] == 101
    assert f.evidence.sources[0].file == "links.csv" and f.evidence.sources[0].row == 13
    assert "FWY" in f.executive_line


def test_connector_identified_by_centroid_end_not_only_class() -> None:
    t = mini_tables()
    links = t["links"]
    links.loc[links["link_id"] == 13, ["b_node", "link_class"]] = [4, "LOC"]
    fs = run_check(CHECK, t)
    assert [f.location.id for f in fs] == ["13"]


def test_connector_too_long() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 14, "length_m"] = 6000.0
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Medium"
    assert f.evidence.values["issue"] == "connector_too_long"
    assert f.evidence.thresholds["max_connector_length_m"] == 5000
    assert "6.0 km" in f.executive_line


def test_both_issues_on_one_connector() -> None:
    t = mini_tables()
    t["links"].loc[t["links"]["link_id"] == 13, ["b_node", "length_m"]] = [4, 7000.0]
    fs = run_check(CHECK, t)
    assert {f.evidence.values["issue"] for f in fs} == {
        "connector_on_high_class", "connector_too_long"}
    assert len({f.finding_id for f in fs}) == 2
