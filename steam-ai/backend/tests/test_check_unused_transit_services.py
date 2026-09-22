"""unused_transit_services on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "unused_transit_services"


def test_used_line_has_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []  # load 40 / capacity 80


def test_empty_line_with_nearby_demand() -> None:
    t = mini_tables()
    t["line_loads"]["load"] = 1.0  # 1.25% of capacity
    fs = run_check(CHECK, t, params={"min_catchment_demand": 300})
    # One finding per line, aggregated across the periods with demand (AM and PM here).
    assert [f.location.id for f in fs] == ["B1"]
    f = fs[0]
    assert f.severity.value == "High"
    v = f.evidence.values
    assert v["load_factor"] == pytest.approx(1 / 80)
    assert v["catchment_demand"] == 780.0  # 390 per period (zones 1, 2, 4) x AM + PM
    assert v["n_periods_with_demand"] == 2
    assert {p["period"] for p in v["per_period"]} == {"AM", "PM"}
    assert v["n_catchment_zones"] == 3
    assert v["headway_min"] == 10.0 and v["mode"] == "BUS"
    assert f.location.type.value == "line" and f.location.lon is not None
    assert {s.table for s in f.evidence.sources} == {"line_loads", "od"}
    assert "% full on average" in f.executive_line and "780 public transport" in f.executive_line


def test_demand_threshold_suppresses_finding() -> None:
    t = mini_tables()
    t["line_loads"]["load"] = 1.0
    assert run_check(CHECK, t) == []  # 390 < default 500


def test_medium_band() -> None:
    t = mini_tables()
    t["line_loads"]["load"] = 3.0  # 3.75%
    fs = run_check(CHECK, t, params={"min_catchment_demand": 300})
    assert fs and all(f.severity.value == "Medium" for f in fs)


def test_catchment_radius_controls_demand() -> None:
    t = mini_tables()
    t["line_loads"]["load"] = 1.0
    fs = run_check(CHECK, t, params={"min_catchment_demand": 300, "catchment_km": 0.1})
    assert fs == []
    fs = run_check(CHECK, t, params={"min_catchment_demand": 300, "catchment_km": 10.0})
    assert fs and fs[0].evidence.values["n_catchment_zones"] == 4
