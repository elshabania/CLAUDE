"""Tests for proposed measures on Critical/High findings."""

from __future__ import annotations

import pytest
from fixtures_mini import (  # noqa: F401
    check_config,
    dummy_finding,
    make_run,
    mini_data_dir,
    mini_tables,
)

from steam_ai import solutions
from steam_ai.checks.registry import REGISTRY
from steam_ai.models import EffectMethod

pytestmark = pytest.mark.usefixtures("mini_data_dir")

def _run(check_id: str, store, params: dict | None = None):
    p, rules = check_config(check_id)
    p.update(params or {})
    return REGISTRY[check_id].run(store, None, p, rules)


def test_overcapacity_link_gets_add_lane_measure() -> None:
    t = mini_tables()
    lf = t["link_flows"]
    lf.loc[(lf["link_id"] == 1) & (lf["period"] == "AM"), ["volume", "vc_ratio"]] = [9000.0, 1.5]
    store = make_run("r", t)
    findings = solutions.propose(store, _run("link_volume_outliers", store))
    f = next(x for x in findings if x.location.id == "1")
    assert f.severity.value == "Critical"
    assert 1 <= len(f.measures) <= 3
    m = f.measures[0]
    assert m.measure_id == f"{f.finding_id}-m1"
    assert m.method is EffectMethod.SKETCH_ELASTICITY and m.confidence == "medium"
    assert m.effect_values["capacity_after_vph"] == 3000.0  # 2000 + 2000/2 lanes
    assert m.effect_values["vc_after"] == pytest.approx(1.5 * 2 / 3)
    assert "V/C" in (m.estimated_effect or "")


def test_connector_on_freeway_measure_uses_connector_volume() -> None:
    t = mini_tables()
    links = t["links"]
    links.loc[links["link_id"] == 13, "b_node"] = 4  # node 4 sits on the FWY
    store = make_run("r", t)
    findings = solutions.propose(store, _run("centroid_connectors", store))
    f = next(x for x in findings if x.evidence.values["issue"] == "connector_on_high_class")
    m = f.measures[0]
    assert m.method is EffectMethod.SKETCH_ELASTICITY
    assert m.effect_values["connector_volume_all_periods"] == 1000.0  # 500 AM + 500 PM
    assert "1,000 vehicles" in (m.estimated_effect or "")
    assert "FWY" in (m.estimated_effect or "")


def test_headway_measure_reports_seat_km() -> None:
    t = mini_tables()
    tl = t["transit_lines"]
    tl.loc[(tl["line_id"] == "B1") & (tl["period"] == "AM"), "headway_min"] = 240.0
    store = make_run("r", t)
    findings = solutions.propose(store, _run("transit_line_integrity", store))
    f = findings[0]
    assert f.evidence.values["issue"] == "headway_out_of_range"
    m = f.measures[0]
    assert m.title == "Set headway to 120 minutes"
    assert m.method is EffectMethod.SKETCH_ELASTICITY
    route_km = m.effect_values["route_km"]
    assert route_km == pytest.approx(4.0, rel=0.01)
    assert m.effect_values["seat_km_per_hour_before"] == pytest.approx(60 / 240 * 80 * route_km)
    assert m.effect_values["seat_km_per_hour_after"] == pytest.approx(60 / 120 * 80 * route_km)


def test_unused_service_measure_halves_frequency() -> None:
    t = mini_tables()
    t["line_loads"]["load"] = 1.0
    store = make_run("r", t)
    findings = solutions.propose(
        store, _run("unused_transit_services", store, {"min_catchment_demand": 300}))
    assert findings and findings[0].severity.value == "High"
    titles = [m.title for m in findings[0].measures]
    assert "Halve the frequency" in titles
    halve = next(m for m in findings[0].measures if m.title == "Halve the frequency")
    assert halve.effect_values["headway_after_min"] == 20.0
    # Summed over the periods the line serves, each with its own headway and hours.
    from steam_ai import config as _config

    hours = _config.period_hours()
    expected = sum(0.5 * (60.0 / p["headway_min"]) * 4.0 * hours[p["period"]]
                   for p in findings[0].evidence.values["per_period"])
    assert expected > 0
    assert halve.effect_values["vehicle_km_saved_per_day"] == pytest.approx(expected, rel=0.01)
    assert halve.effect_values["vehicle_km_saved_AM"] == pytest.approx(0.5 * 6 * 4.0 * 3.0,
                                                                        rel=0.01)


def test_land_use_measure_gives_scale_factor() -> None:
    t = mini_tables()
    ct = t["control_totals"]
    ct.loc[(ct["variable"] == "POP") & (ct["region"] == "ALL"), "value"] = 12000.0
    store = make_run("r", t)
    findings = solutions.propose(store, _run("land_use_control_totals", store))
    m = findings[0].measures[0]
    assert m.method is EffectMethod.SKETCH_ELASTICITY and m.confidence == "high"
    assert m.effect_values["scale_factor"] == pytest.approx(1.2)
    assert m.effect_values["delta"] == 2000.0


def test_only_critical_and_high_get_measures() -> None:
    store = make_run("r", mini_tables())
    medium = dummy_finding("parameter_drift", "Medium")
    info = dummy_finding("parameter_drift", "Info")
    high = dummy_finding("parameter_drift", "High", values={"key": "X"})
    unknown = dummy_finding("not_a_check", "Critical")
    out = solutions.propose(store, [medium, info, high, unknown])
    assert out[0].measures == [] and out[1].measures == []
    assert len(out[2].measures) == 1
    assert out[2].measures[0].method is EffectMethod.NOT_COMPUTABLE
    assert out[3].measures == []
    assert out is not None and len(out) == 4


def test_propose_never_raises_on_garbage_values() -> None:
    store = make_run("r", mini_tables())
    bad = dummy_finding("centroid_connectors", "High", loc_id="not-an-int",
                        values={"issue": "connector_on_high_class"})
    out = solutions.propose(store, [bad])
    assert len(out[0].measures) >= 1
