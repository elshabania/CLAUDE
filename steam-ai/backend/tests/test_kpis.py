"""Tests for KPI computation from config/kpis.yaml."""

from __future__ import annotations

import pytest
from fixtures_mini import make_run, mini_data_dir, mini_tables  # noqa: F401

from steam_ai import config, kpis

pytestmark = pytest.mark.usefixtures("mini_data_dir")

def test_all_configured_kpis_computed() -> None:
    store = make_run("r", mini_tables())
    out = kpis.compute(store)
    assert {k.kpi_id for k in out} == {k["id"] for k in config.kpis()}
    by_id = {k.kpi_id: k for k in out}
    expected_vkt = store.scalar(
        "SELECT SUM(f.volume * l.length_m / 1000.0) FROM link_flows f JOIN links l USING (link_id) "
        "WHERE f.period = 'AM' AND f.user_class = 'ALL'"
    )
    assert by_id["total_vkt_am"].value == pytest.approx(float(expected_vkt))
    assert by_id["total_vkt_am"].period == "AM"
    assert by_id["mean_trip_length_km"].period is None
    assert by_id["share_links_over_capacity_am"].value == 0.0
    assert by_id["pt_share_am"].value == pytest.approx(520 / 1760)
    assert {s.table for s in by_id["total_vkt_am"].sources} == {"link_flows", "links"}
    assert all(s.file.endswith(".csv") for s in by_id["total_vkt_am"].sources)
    assert "SELECT" in by_id["total_vkt_am"].definition


def test_missing_table_skips_only_that_kpi() -> None:
    t = mini_tables()
    t.pop("skims")
    store = make_run("r", t)
    ids = {k.kpi_id for k in kpis.compute(store)}
    assert "mean_trip_length_km" not in ids
    assert "total_vkt_am" in ids and "pt_share_am" in ids


def test_empty_result_is_skipped_not_nan() -> None:
    t = mini_tables()
    t["od"] = t["od"].iloc[0:0]
    store = make_run("r", t)
    ids = {k.kpi_id for k in kpis.compute(store)}
    assert "total_trips_am" not in ids and "pt_share_am" not in ids
    assert "total_vkt_am" in ids


def test_tables_in_matches_whole_words() -> None:
    assert kpis.tables_in("SELECT 1 FROM link_flows f JOIN links l USING (link_id)") == [
        "link_flows", "links"]
    assert kpis.tables_in("SELECT nodes_x FROM od") == ["od"]
