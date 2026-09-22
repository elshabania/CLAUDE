"""unrealistic_speeds_times on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "unrealistic_speeds_times"


def _set_flow(t: dict, link_id: int, period: str, **cols) -> None:
    lf = t["link_flows"]
    mask = (lf["link_id"] == link_id) & (lf["period"] == period)
    for k, v in cols.items():
        lf.loc[mask, k] = v


def test_clean_flows_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_speed_above_free_flow() -> None:
    t = mini_tables()
    _set_flow(t, 1, "AM", cong_speed_kph=70.0)  # ffs 60 -> ratio 1.17 > 1.05
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "High" and f.evidence.values["issue"] == "speed_above_ffs"
    assert f.location.id == "1" and f.evidence.period == "AM"
    assert f.evidence.values["ffs_kph"] == 60.0 and f.evidence.values["cong_speed_kph"] == 70.0
    assert f.evidence.sources[0].column == "cong_speed_kph"
    assert f.evidence.sources[0].row == 1


def test_speed_within_tolerance_is_fine() -> None:
    t = mini_tables()
    _set_flow(t, 1, "AM", cong_speed_kph=62.0)  # 1.03 < 1.05
    assert run_check(CHECK, t) == []


def test_speed_below_floor() -> None:
    t = mini_tables()
    _set_flow(t, 2, "PM", cong_speed_kph=3.0)
    fs = run_check(CHECK, t)
    assert [(f.location.id, f.evidence.period, f.evidence.values["issue"]) for f in fs] == [
        ("2", "PM", "speed_below_floor")]
    assert fs[0].severity.value == "High"
    assert "crawls" in fs[0].executive_line


def test_delay_outlier() -> None:
    t = mini_tables()
    _set_flow(t, 3, "AM", delay_s=1000.0)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    assert fs[0].severity.value == "Medium" and fs[0].evidence.values["issue"] == "delay_outlier"
    assert fs[0].evidence.sources[0].column == "delay_s"
    assert "16.7 minutes" in fs[0].executive_line


def test_multiple_issues_are_one_finding() -> None:
    t = mini_tables()
    _set_flow(t, 3, "AM", delay_s=1000.0, cong_speed_kph=1.0)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    assert fs[0].evidence.values["issue"] == "speed_below_floor"
    assert fs[0].evidence.values["issues"] == ["speed_below_floor", "delay_outlier"]


def test_period_filter() -> None:
    t = mini_tables()
    _set_flow(t, 1, "AM", cong_speed_kph=3.0)
    assert run_check(CHECK, t, params={"periods": ["PM"]}) == []
