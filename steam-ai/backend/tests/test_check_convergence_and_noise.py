"""convergence_and_noise on mini fixtures."""

from __future__ import annotations

import pandas as pd
import pytest
from fixtures_mini import (  # noqa: F401
    check_config,
    make_run,
    mini_data_dir,
    mini_tables,
    run_check,
)

from steam_ai.checks.registry import REGISTRY

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "convergence_and_noise"


def _set_final_gap(t: dict, period: str, gap: float) -> None:
    conv = t["convergence"]
    conv.loc[(conv["period"] == period) & (conv["iteration"] == 5), "value"] = gap


def test_converged_run_has_no_findings_and_writes_band() -> None:
    store = make_run("r", mini_tables())
    check = REGISTRY[CHECK]
    params, rules = check_config(CHECK)
    assert check.run(store, None, params, rules) == []
    assert "noise band written for 36" in (check.message or "")
    band = store.noise_band()
    assert band is not None and len(band) == 36
    assert set(band["level"]) == {"link", "sector"}
    assert (band["band_high"] >= 0).all() and (band["band_low"] == -band["band_high"]).all()


def test_relative_gap_bands() -> None:
    t = mini_tables()
    _set_final_gap(t, "AM", 0.02)
    _set_final_gap(t, "PM", 0.005)
    fs = {f.evidence.period: f for f in run_check(CHECK, t)}
    assert fs["AM"].severity.value == "Critical" and fs["PM"].severity.value == "High"
    assert fs["AM"].evidence.values["rel_gap"] == 0.02
    assert fs["AM"].evidence.values["iterations"] == 5
    assert fs["AM"].location.type.value == "run"
    assert fs["AM"].evidence.sources[0].table == "convergence"
    assert fs["AM"].evidence.sources[0].row == 5
    assert "AM peak" in fs["AM"].executive_line and "2.00%" in fs["AM"].executive_line


def test_demand_loop_stage_not_judged_by_assignment_target() -> None:
    t = mini_tables()
    conv = t["convergence"]
    extra = conv.iloc[[0]].copy()
    extra[["stage", "period", "iteration", "value"]] = ["DEMAND_LOOP", "ALL", 3, 0.05]
    t["convergence"] = pd.concat([conv, extra], ignore_index=True)
    assert run_check(CHECK, t) == []
    fs = run_check(CHECK, t, params={"stages": []})
    assert [(f.evidence.values["stage"], f.evidence.period) for f in fs] == [("DEMAND_LOOP", "ALL")]


def test_unstable_flows_between_last_iterations() -> None:
    t = mini_tables()
    it = t["iteration_flows"]
    mask = (it["period"] == "AM") & (it["iteration"] == 5) & (it["link_id"] <= 10)
    it.loc[mask, "volume"] = it.loc[mask, "volume"] * 3
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Medium" and f.evidence.period == "AM"
    assert f.evidence.values["stable_share"] == 6 / 16
    assert f.evidence.values["n_links"] == 16
    assert f.evidence.sources[0].table == "iteration_flows"


def test_noise_band_uses_last_n_iterations() -> None:
    t = mini_tables()
    it = t["iteration_flows"]
    mask = (it["period"] == "AM") & (it["iteration"] == 3) & (it["link_id"] == 1)
    it.loc[mask, "volume"] = 100.0  # a wide early iteration; excluded when N = 2
    store = make_run("r", t)
    params, rules = check_config(CHECK)
    REGISTRY[CHECK].run(store, None, {**params, "noise_band_iterations": 2}, rules)
    band = store.noise_band()
    row = band[(band["level"] == "link") & (band["location_id"] == "1")
               & (band["period"] == "AM")].iloc[0]
    assert row["band_high"] == 1.0 and row["method"] == "range_last_2_iterations"


def test_without_iteration_flows_band_is_not_computed() -> None:
    t = mini_tables()
    t.pop("iteration_flows")
    store = make_run("r", t)
    check = REGISTRY[CHECK]
    params, rules = check_config(CHECK)
    assert check.run(store, None, params, rules) == []
    assert "absent" in (check.message or "")
    assert store.noise_band() is None
