"""land_use_control_totals on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "land_use_control_totals"


def _set_control(t: dict, variable: str, region: str, value: float) -> None:
    ct = t["control_totals"]
    ct.loc[(ct["variable"] == variable) & (ct["region"] == region), "value"] = value


def test_matching_totals_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


@pytest.mark.parametrize(
    "control,severity", [(12000.0, "Critical"), (10600.0, "High"), (10300.0, "Medium")]
)
def test_severity_bands(control: float, severity: str) -> None:
    t = mini_tables()
    _set_control(t, "POP", "ALL", control)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == severity
    v = f.evidence.values
    assert (v["variable"], v["region"], v["modelled"], v["control"]) == ("POP", "ALL", 10000.0,
                                                                        control)
    assert v["abs_diff_share"] == pytest.approx(abs(10000 - control) / control)
    assert v["scale_factor"] == pytest.approx(control / 10000)
    assert f.location.type.value == "run"
    assert f.evidence.sources[0].table == "control_totals" and f.evidence.sources[0].row == 1


def test_within_tolerance_is_silent() -> None:
    t = mini_tables()
    _set_control(t, "POP", "ALL", 10100.0)
    assert run_check(CHECK, t) == []


def test_region_total_uses_zone_region() -> None:
    t = mini_tables()
    _set_control(t, "POP", "ABU", 12000.0)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    assert fs[0].evidence.values["region"] == "ABU"
    assert "region ABU" in fs[0].executive_line
    assert "population" in fs[0].executive_line


def test_control_with_no_land_use_rows() -> None:
    t = mini_tables()
    t["control_totals"].loc[0, "variable"] = "STUDENTS"
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    assert fs[0].evidence.values["modelled"] == 0.0
    assert fs[0].severity.value == "Critical"
