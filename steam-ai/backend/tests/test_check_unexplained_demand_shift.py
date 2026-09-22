"""unexplained_demand_shift on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "unexplained_demand_shift"
S1_ZONES = (1, 3)
S2_ZONES = (2, 4)


def _shift_s1_to_s2(t: dict, factor: float = 1.5) -> None:
    od = t["od"]
    mask = od["origin"].isin(S1_ZONES) & od["destination"].isin(S2_ZONES)
    od.loc[mask, "trips"] *= factor


def test_identical_runs_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables(), base_tables=mini_tables()) == []


def test_unexplained_shift_is_flagged() -> None:
    t = mini_tables()
    _shift_s1_to_s2(t, 1.5)
    fs = run_check(CHECK, t, base_tables=mini_tables())
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "High"
    assert f.location.type.value == "sector" and f.location.id == "S1->S2"
    v = f.evidence.values
    assert v["explained"] is False and v["explanation"] == {}
    assert v["shift_share"] == pytest.approx(0.5)
    assert v["base_trips"] == 1120.0 and v["run_trips"] == 1680.0
    assert "no change to land use" in f.executive_line
    assert {s.table for s in f.evidence.sources} == {"od"}


def test_medium_band() -> None:
    t = mini_tables()
    _shift_s1_to_s2(t, 1.2)
    fs = run_check(CHECK, t, base_tables=mini_tables())
    assert [f.severity.value for f in fs] == ["Medium"]


def test_land_use_change_explains_shift() -> None:
    t = mini_tables()
    _shift_s1_to_s2(t, 1.5)
    lu = t["land_use"]
    lu.loc[(lu["zone_id"] == 1) & (lu["variable"] == "POP"), "value"] *= 1.1
    fs = run_check(CHECK, t, base_tables=mini_tables())
    # Explained shifts are collapsed into one Info summary at run level.
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Info" and f.location.type.value == "run"
    v = f.evidence.values
    assert v["n_explained_shifts"] == 1
    pair = v["explained_pairs"][0]
    assert (pair["origin_sector"], pair["destination_sector"]) == ("S1", "S2")
    assert pair["explained_by"] == ["S1"]
    assert "consistent with input changes" in f.executive_line


def test_network_change_in_destination_sector_explains_shift() -> None:
    t = mini_tables()
    _shift_s1_to_s2(t, 1.5)
    links = t["links"]
    links.loc[links["link_id"] == 2, "capacity_vph"] = 4000.0  # link 2 is in S2
    fs = run_check(CHECK, t, base_tables=mini_tables())
    assert [f.severity.value for f in fs] == ["Info"]
    assert fs[0].evidence.values["explained_pairs"][0]["explained_by"] == ["S2"]


def test_tiny_land_use_change_does_not_explain() -> None:
    t = mini_tables()
    _shift_s1_to_s2(t, 1.5)
    lu = t["land_use"]
    lu.loc[(lu["zone_id"] == 1) & (lu["variable"] == "POP"), "value"] *= 1.001
    fs = run_check(CHECK, t, base_tables=mini_tables())
    assert fs[0].severity.value == "High" and fs[0].evidence.values["explained"] is False


def test_min_pair_trips_filter() -> None:
    t = mini_tables()
    _shift_s1_to_s2(t, 1.5)
    assert run_check(CHECK, t, base_tables=mini_tables(),
                     params={"min_sector_pair_trips": 5000}) == []
