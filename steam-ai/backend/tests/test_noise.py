"""Tests for the noise band computation and its application to findings."""

from __future__ import annotations

import pytest
from fixtures_mini import (  # noqa: F401
    check_config,
    dummy_finding,
    make_run,
    mini_data_dir,
    mini_tables,
)

from steam_ai import noise
from steam_ai.checks.registry import REGISTRY

pytestmark = pytest.mark.usefixtures("mini_data_dir")

def _with_band(run_id: str, tables: dict | None = None):
    store = make_run(run_id, tables or mini_tables())
    params, rules = check_config("convergence_and_noise")
    REGISTRY["convergence_and_noise"].run(store, None, params, rules)
    return store


def test_band_is_range_over_last_iterations() -> None:
    store = _with_band("r")
    band = store.noise_band()
    assert band is not None
    assert set(band.columns) >= {"level", "location_id", "period", "metric", "band_low",
                                 "band_high", "method"}
    link1 = band[(band["level"] == "link") & (band["location_id"] == "1")
                 & (band["period"] == "AM")].iloc[0]
    assert link1["band_high"] == 3.0 and link1["band_low"] == -3.0  # volumes v-2, v+1, v
    assert link1["metric"] == "volume" and "3" in link1["method"]
    s1 = band[(band["level"] == "sector") & (band["location_id"] == "S1")
              & (band["period"] == "AM")].iloc[0]
    n_s1 = store.scalar("SELECT COUNT(*) FROM links WHERE sector_id = 'S1'")
    assert s1["band_high"] == 3.0 * n_s1
    assert len(band) == 16 * 2 + 2 * 2
    # the store re-registers the view so SQL can read it
    assert store.scalar("SELECT COUNT(*) FROM noise_band") == len(band)


def test_apply_noise_band_marks_small_deltas_insignificant() -> None:
    store = _with_band("r")
    inside = dummy_finding("cmp", "High", "link", "1", "AM", {"delta_volume": 2.0})
    outside = dummy_finding("cmp", "High", "link", "1", "AM", {"delta_volume": 5.0})
    negative_inside = dummy_finding("cmp", "High", "link", "2", "PM", {"delta_volume": -3.0})
    no_period = dummy_finding("cmp", "High", "link", "1", None, {"delta_volume": 2.5})
    sector = dummy_finding("cmp", "High", "sector", "S1", "AM", {"delta_volume": 10.0})
    absolute = dummy_finding("abs", "High", "link", "1", "AM", {"vc_ratio": 1.5})
    zone = dummy_finding("cmp", "High", "zone", "1", "AM", {"delta_volume": 0.0})
    unknown_link = dummy_finding("cmp", "High", "link", "999", "AM", {"delta_volume": 0.0})
    out = noise.apply_noise_band(
        [inside, outside, negative_inside, no_period, sector, absolute, zone, unknown_link], store
    )
    assert out[0].is_significant is False
    assert out[0].evidence.thresholds["noise_band"] == {"low": -3.0, "high": 3.0}
    assert out[1].is_significant is True
    assert out[2].is_significant is False
    assert out[3].is_significant is False  # widest band over periods
    assert out[4].is_significant is False  # sector band = 3 x links in S1 >= 10
    assert out[5].is_significant is True
    assert out[6].is_significant is True
    assert out[7].is_significant is True


def test_no_band_leaves_everything_significant() -> None:
    store = make_run("r", mini_tables())
    f = dummy_finding("cmp", "High", "link", "1", "AM", {"delta_volume": 0.0})
    assert noise.apply_noise_band([f], store)[0].is_significant is True
    assert noise.significant_delta(store, None, "link", "1", "AM", 0.0) is True


def test_significant_delta_falls_back_to_base() -> None:
    base = _with_band("base")
    scen = make_run("scen", mini_tables(), base_run_id="base")
    assert noise.significant_delta(scen, base, "link", "1", "AM", 1.0) is False
    assert noise.significant_delta(scen, base, "link", "1", "AM", 4.0) is True
    assert noise.significant_delta(scen, base, "link", "1", None, -2.0) is False
    assert noise.significant_delta(scen, base, "sector", "S2", "PM", 1.0) is False
    assert noise.significant_delta(scen, base, "line", "B1", "AM", 1.0) is True  # no line band
