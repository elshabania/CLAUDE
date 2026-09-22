"""Tests for run-vs-base change summaries."""

from __future__ import annotations

import json

import pandas as pd
import pytest
from fixtures_mini import dummy_finding, make_run, mini_data_dir, mini_tables  # noqa: F401

from steam_ai import changes
from steam_ai.models import KPI

pytestmark = pytest.mark.usefixtures("mini_data_dir")

def _kpi(kid: str, value: float) -> KPI:
    return KPI(kpi_id=kid, name=kid, value=value, unit="x", definition="d")


def _scenario_tables() -> dict:
    t = mini_tables()
    lu = t["land_use"]
    lu.loc[(lu["zone_id"] == 1) & (lu["variable"] == "POP"), "value"] = 1200.0  # S1 POP +5%
    links = t["links"]
    links.loc[links["link_id"] == 1, "capacity_vph"] = 3000.0
    new = links[links["link_id"] == 1].copy()
    new["link_id"] = 99
    new["b_node"] = 5
    t["links"] = links[links["link_id"] != 12].pipe(lambda d: pd.concat([d, new], ignore_index=True))
    tl = t["transit_lines"]
    tl.loc[(tl["line_id"] == "B1") & (tl["period"] == "AM"), "headway_min"] = 5.0
    b2 = tl.iloc[[0]].copy()
    b2["line_id"] = "B2"
    t["transit_lines"] = pd.concat([tl, b2])
    seg = t["transit_segments"]
    seg2 = seg.copy()
    seg2["line_id"] = "B2"
    t["transit_segments"] = pd.concat([seg, seg2], ignore_index=True)
    par = t["parameters"]
    par.loc[par["key"] == "VOT_CAR", "value"] = "2.0"
    return t


def test_compute_summarises_all_input_differences() -> None:
    base = make_run("base", mini_tables())
    scen = make_run("scen", _scenario_tables(), base_run_id="base")
    base.write_findings([dummy_finding("a", "High", loc_id="1", run_id="base"),
                         dummy_finding("b", "High", loc_id="2", run_id="base")])
    scen.write_findings([dummy_finding("b", "High", loc_id="2", run_id="scen"),
                         dummy_finding("c", "High", loc_id="3", run_id="scen")])
    base.write_kpis([_kpi("total_trips_am", 100.0), _kpi("only_base", 1.0)])
    scen.write_kpis([_kpi("total_trips_am", 110.0), _kpi("only_scen", 1.0)])

    out = changes.compute(scen, base)
    json.dumps(out)  # must be serialisable
    assert out["run_id"] == "scen" and out["base_run_id"] == "base"

    lu = out["land_use"]
    assert lu["available"] is True
    s1_pop = [r for r in lu["by_sector"] if r["sector_id"] == "S1" and r["variable"] == "POP"]
    assert len(s1_pop) == 1
    assert s1_pop[0]["delta"] == 200.0 and s1_pop[0]["delta_share"] == pytest.approx(0.05)
    totals = {r["variable"]: r for r in lu["totals"]}
    assert totals["POP"]["delta"] == 200.0 and totals["EMP_TOTAL"]["delta"] == 0.0

    links = out["links"]
    assert links["n_added"] == 1 and links["n_removed"] == 1 and links["n_changed"] == 1
    assert links["n_capacity_changed"] == 1 and links["n_lanes_changed"] == 0
    assert {(r["sector_id"], r["change"]) for r in links["by_sector"]} >= {("S1", "changed")}
    ex = {r["link_id"]: r for r in links["examples"]}
    assert ex[1]["base_capacity_vph"] == 2000.0 and ex[1]["capacity_vph"] == 3000.0
    assert ex[99]["change"] == "added" and ex[12]["change"] == "removed"

    tr = out["transit"]
    assert tr["lines_added"] == ["B2"] and tr["lines_removed"] == []
    assert tr["n_headway_changes"] == 1
    hc = tr["headway_changes"][0]
    assert (hc["line_id"], hc["period"], hc["base_headway_min"], hc["headway_min"]) == (
        "B1", "AM", 10.0, 5.0)
    assert set(tr["line_sectors"]["B1"]) == {"S1", "S2"}

    assert out["parameters"] == [
        {"key": "VOT_CAR", "run_value": "2.0", "base_value": "1.5", "change": "changed"}]

    fd = out["findings"]
    assert (fd["n_new"], fd["n_resolved"], fd["n_unchanged"]) == (1, 1, 1)
    assert fd["new"][0]["check_id"] == "c" and fd["resolved"][0]["check_id"] == "a"

    kd = {k["kpi_id"]: k for k in out["kpis"]}
    assert set(kd) == {"total_trips_am"}
    assert kd["total_trips_am"]["delta"] == 10.0
    assert kd["total_trips_am"]["delta_share"] == pytest.approx(0.1)


def test_identical_runs_report_no_changes() -> None:
    base = make_run("base", mini_tables())
    scen = make_run("scen", mini_tables(), base_run_id="base")
    out = changes.compute(scen, base)
    assert out["land_use"]["n_sector_variables_changed"] == 0
    assert out["links"]["n_added"] == out["links"]["n_removed"] == out["links"]["n_changed"] == 0
    assert out["transit"]["lines_added"] == [] and out["transit"]["n_headway_changes"] == 0
    assert out["parameters"] == []
    assert out["findings"]["n_new"] == 0
    assert changes.sector_change_summary(scen, base) == {}


def test_sector_change_summary_names_the_change() -> None:
    base = make_run("base", mini_tables())
    scen = make_run("scen", _scenario_tables(), base_run_id="base")
    summary = changes.sector_change_summary(scen, base, land_use_share=0.01)
    assert "S1" in summary and any("POP" in s for s in summary["S1"])
    assert any("link" in s for s in summary["S1"])
    assert any("B2 added" in s for s in summary["S2"])
    # a higher land-use threshold hides the 5% change but keeps the link changes
    summary2 = changes.sector_change_summary(scen, base, land_use_share=0.10)
    assert not any("POP" in s for s in summary2.get("S1", []))


def test_missing_tables_are_reported_as_unavailable() -> None:
    t = mini_tables()
    t.pop("parameters")
    t.pop("transit_lines")
    base = make_run("base", t)
    scen = make_run("scen", mini_tables(), base_run_id="base")
    out = changes.compute(scen, base)
    assert out["parameters"] == []
    assert out["transit"] == {"available": False}
