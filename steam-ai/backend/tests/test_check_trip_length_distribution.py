"""trip_length_distribution on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import (  # noqa: F401
    check_config,
    make_run,
    mini_data_dir,
    mini_tables,
    run_check,
)

from steam_ai.checks.base import SkipCheck
from steam_ai.checks.registry import REGISTRY

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "trip_length_distribution"


def _scale_car_skims(t: dict, factor: float) -> None:
    sk = t["skims"]
    sk.loc[sk["mode"] == "CAR", "value"] *= factor


def test_identical_runs_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables(), base_tables=mini_tables()) == []


@pytest.mark.parametrize("factor,severity", [(1.5, "High"), (1.2, "Medium")])
def test_mean_shift_versus_base(factor: float, severity: str) -> None:
    t = mini_tables()
    _scale_car_skims(t, factor)
    fs = run_check(CHECK, t, base_tables=mini_tables())
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == severity
    assert f.location.type.value == "matrix" and f.location.id == "HBW/CAR"
    v = f.evidence.values
    assert v["mean_diff_share"] == pytest.approx(factor - 1, rel=1e-6)
    assert v["mean_km"] == pytest.approx(v["mean_km_base"] * factor, rel=1e-6)
    assert v["bins_km"] == [0, 2, 5, 10, 20, 40, 80, 200]
    assert sum(v["run_share"]) == pytest.approx(1.0) and sum(v["base_share"]) == pytest.approx(1.0)
    if factor == 1.5:  # 1.2 keeps every trip in the same 2/5/10/20 km bin
        assert v["run_share"] != v["base_share"]
    assert "base run base" in v["comparison"]
    assert {s.table for s in f.evidence.sources} == {"od", "skims"}
    assert "longer" in f.executive_line


def test_small_shift_is_silent() -> None:
    t = mini_tables()
    _scale_car_skims(t, 1.1)
    assert run_check(CHECK, t, base_tables=mini_tables()) == []


def test_reference_means_without_base() -> None:
    fs = run_check(CHECK, mini_tables(),
                   params={"reference_mean_km": {"HBW/CAR": 100.0, "HBW/PT": 5.0}})
    by_id = {f.location.id: f for f in fs}
    assert "HBW/CAR" in by_id and by_id["HBW/CAR"].severity.value == "High"
    assert by_id["HBW/CAR"].evidence.values["mean_km_base"] == 100.0
    assert by_id["HBW/CAR"].evidence.values["comparison"] == "configured reference means"
    assert "HBW/PT" not in by_id  # PT mean is 5.6 km, within 15% of the 5.0 reference
    assert sum(by_id["HBW/CAR"].evidence.values["base_share"]) == 0.0


def test_no_base_and_no_reference_skips() -> None:
    store = make_run("r", mini_tables())
    params, rules = check_config(CHECK)
    params["reference_mean_km"] = {}
    with pytest.raises(SkipCheck):
        REGISTRY[CHECK].run(store, None, params, rules)
    assert REGISTRY[CHECK].needs_base is True
    assert REGISTRY[CHECK].base_optional_with(params) is False
    assert REGISTRY[CHECK].base_optional_with({"reference_mean_km": {"HBW": 1}}) is True
