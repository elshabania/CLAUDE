"""matrix_sanity on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "matrix_sanity"


def test_clean_matrices_have_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_negative_cells() -> None:
    t = mini_tables()
    od = t["od"]
    mask = (od["mode"] == "CAR") & (od["period"] == "AM") & (od["origin"] == 1) & (
        od["destination"] == 2)
    od.loc[mask, "trips"] = -5.0
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Critical" and f.evidence.values["issue"] == "negative_cells"
    assert f.location.type.value == "matrix" and f.location.id == "HBW/CAR/AM"
    assert f.evidence.values["n_cells"] == 1 and f.evidence.values["min_trips"] == -5.0
    assert f.evidence.values["example_cells"] == ["1-2"]
    assert f.evidence.period == "AM"
    assert f.evidence.sources[0].table == "od"


def test_row_column_imbalance() -> None:
    t = mini_tables()
    od = t["od"]
    od.loc[(od["origin"] == 1) & (od["destination"] != 1), "trips"] *= 20
    od.loc[(od["destination"] == 1) & (od["origin"] != 1), "trips"] *= 0.1
    # four zones: every one is unbalanced, which the default reads as a PA matrix;
    # lift that threshold to test the per-zone findings
    fs = [f for f in run_check(CHECK, t, params={"pa_format_share": 1.0})
          if f.evidence.values["issue"] == "row_col_imbalance"]
    # with four zones, zone 1's row/column scaling also unbalances its neighbours;
    # zone 1 must be the worst and the only one producing more than it attracts
    by_zone = {f.location.id: f for f in fs}
    assert "1" in by_zone
    f = by_zone["1"]
    assert f.severity.value == "High"
    assert f.location.type.value == "zone" and f.location.lon is not None
    assert f.evidence.values["ratio"] > 5
    assert f.evidence.values["productions"] > f.evidence.values["attractions"]
    assert f.evidence.values["ratio"] == max(x.evidence.values["ratio"] for x in fs)
    assert all(x.evidence.values["productions"] < x.evidence.values["attractions"]
               for x in fs if x.location.id != "1")


def test_widespread_imbalance_reads_as_pa_matrix() -> None:
    t = mini_tables()
    od = t["od"]
    od.loc[(od["origin"] == 1) & (od["destination"] != 1), "trips"] *= 20
    od.loc[(od["destination"] == 1) & (od["origin"] != 1), "trips"] *= 0.1
    fs = run_check(CHECK, t)
    issues = [f.evidence.values["issue"] for f in fs]
    assert "row_col_imbalance" not in issues
    pa = [f for f in fs if f.evidence.values["issue"] == "pa_format_suspected"]
    assert len(pa) == 1 and pa[0].severity.value == "Info"
    assert pa[0].location.type.value == "matrix"
    assert pa[0].evidence.values["share_imbalanced"] > 0.25


def test_intrazonal_share_per_matrix() -> None:
    t = mini_tables()
    od = t["od"]
    od.loc[(od["mode"] == "CAR") & (od["origin"] == od["destination"]), "trips"] = 1000.0
    fs = [f for f in run_check(CHECK, t) if f.evidence.values["issue"] == "intrazonal_share"]
    matrix = [f for f in fs if f.location.type.value == "matrix"]
    assert [f.location.id for f in matrix] == ["HBW/CAR"]
    assert matrix[0].severity.value == "Medium"
    assert matrix[0].evidence.values["intrazonal_share"] > 0.15
    # every zone is affected, so four zone-level findings follow too
    zones = [f for f in fs if f.location.type.value == "zone"]
    assert len(zones) == 4


def test_intrazonal_share_single_zone() -> None:
    t = mini_tables()
    od = t["od"]
    mask = (od["mode"] == "CAR") & (od["origin"] == 2) & (od["destination"] == 2)
    od.loc[mask, "trips"] = 100.0  # zone 2: 220 / 1060 intrazonal; CAR matrix stays < 15%
    fs = run_check(CHECK, t)
    assert [(f.location.type.value, f.location.id) for f in fs] == [("zone", "2")]
    assert fs[0].evidence.values["issue"] == "intrazonal_share"
    assert fs[0].evidence.values["intrazonal_share"] > 0.15


def test_fractional_artefacts_are_info() -> None:
    t = mini_tables()
    od = t["od"]
    mask = (od["mode"] == "CAR") & (od["period"] == "AM") & (od["origin"] != od["destination"])
    od.loc[mask, "trips"] = 0.005
    fs = [f for f in run_check(CHECK, t) if f.evidence.values["issue"] == "fractional_artefact"]
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "Info" and f.location.id == "HBW/CAR/AM"
    assert f.evidence.values["n_fractional"] == 12 and f.evidence.values["n_cells"] == 16
    assert f.evidence.values["fractional_share"] == 0.75
