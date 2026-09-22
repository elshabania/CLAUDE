"""link_volume_outliers on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "link_volume_outliers"


def _set_flow(t: dict, link_id: int, period: str, **cols) -> None:
    lf = t["link_flows"]
    mask = (lf["link_id"] == link_id) & (lf["period"] == period)
    for k, v in cols.items():
        lf.loc[mask, k] = v


def _jitter(t: dict) -> None:
    """Give the ART/URB group some spread so the MAD is non-zero."""
    lf = t["link_flows"]
    art = t["links"].loc[t["links"]["link_class"] == "ART", "link_id"].tolist()
    for i, lid in enumerate(art):
        lf.loc[lf["link_id"] == lid, "volume"] = 3000.0 + 25.0 * i


def test_clean_flows_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


@pytest.mark.parametrize("vc,severity", [(1.5, "Critical"), (1.15, "High"), (0.96, "Medium")])
def test_vc_bands(vc: float, severity: str) -> None:
    t = mini_tables()
    _set_flow(t, 1, "AM", vc_ratio=vc, volume=vc * 6000)
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == severity
    assert f.evidence.values["issue"] == "over_capacity"
    assert f.evidence.values["vc_ratio"] == pytest.approx(vc)
    assert f.evidence.period == "AM" and f.location.id == "1"
    assert f.location.lon is not None and f.location.lat is not None
    assert f.evidence.sources[0].table == "link_flows" and f.evidence.sources[0].row == 1
    assert "AM peak" in f.executive_line


def test_vc_computed_from_capacity_when_missing() -> None:
    t = mini_tables()
    _set_flow(t, 1, "AM", vc_ratio=None, volume=9000.0)  # 9000 / (2000 x 3 h) = 1.5
    fs = run_check(CHECK, t)
    assert len(fs) == 1 and fs[0].severity.value == "Critical"
    assert fs[0].evidence.values["vc_ratio"] == pytest.approx(1.5)


def test_robust_zscore_outlier() -> None:
    t = mini_tables()
    _jitter(t)
    _set_flow(t, 1, "AM", volume=300000.0, vc_ratio=0.5)
    fs = run_check(CHECK, t, params={"min_group_size": 5})
    assert [f.location.id for f in fs] == ["1"]
    f = fs[0]
    assert f.severity.value == "High"  # |z| >= 4
    assert f.evidence.values["issue"] == "statistical_outlier"
    assert f.evidence.values["zscore"] > 4
    assert f.evidence.values["group_size"] == 10
    assert "far above" in f.executive_line


def test_group_too_small_gives_no_zscore() -> None:
    t = mini_tables()
    _jitter(t)
    _set_flow(t, 1, "AM", volume=300000.0, vc_ratio=0.5)
    assert run_check(CHECK, t) == []  # default min_group_size 20 > 10 ART links


def test_too_low_volume() -> None:
    t = mini_tables()
    _jitter(t)
    _set_flow(t, 2, "AM", volume=1.0, vc_ratio=0.0)
    fs = run_check(CHECK, t, params={"min_group_size": 5})
    assert [f.location.id for f in fs] == ["2"]
    assert fs[0].evidence.values["issue"] == "volume_too_low"
    assert fs[0].evidence.values["too_low"] is True
    assert fs[0].severity.value in {"High", "Medium"}
    assert "only 1 vehicles" in fs[0].executive_line


def test_connectors_and_other_periods_are_excluded() -> None:
    t = mini_tables()
    _set_flow(t, 13, "AM", vc_ratio=5.0, volume=1e6)  # CONN
    _set_flow(t, 1, "PM", vc_ratio=1.5, volume=9000.0)
    fs = run_check(CHECK, t, params={"periods": ["AM"]})
    assert fs == []
