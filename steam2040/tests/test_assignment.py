"""Tests for the assignment engine: methods, gap, determinism, invariants."""

import numpy as np

from steam_core import build_csr, load_network
from steam_assignment import assign, METHODS, build_fixed_demand, build_gravity_demand
from steam_assignment.analysis import network_kpis
from steam_assignment.demand import productions


def _demand(loaded):
    return build_fixed_demand(loaded["od"], loaded["zones"], loaded["zone_node"],
                              loaded["settings"])


def test_all_methods_run(loaded):
    dem = _demand(loaded)
    for m in METHODS:
        res = assign(loaded["net"], loaded["graph"], dem, loaded["settings"], m)
        assert res.volume.shape[0] == loaded["net"].n_links
        assert (res.volume >= 0).all()


def test_frank_wolfe_converges(loaded):
    dem = _demand(loaded)
    res = assign(loaded["net"], loaded["graph"], dem, loaded["settings"], METHODS[3])
    assert res.gap_history, "FW should record a gap history"
    assert res.gap_history[-1] < 0.01, "FW relative gap should reach < 1%"
    # overall downward trend (last gap well below the first)
    assert res.gap_history[-1] < res.gap_history[0]


def test_deterministic(loaded):
    dem = _demand(loaded)
    a = assign(loaded["net"], loaded["graph"], dem, loaded["settings"], METHODS[3])
    b = assign(loaded["net"], loaded["graph"], dem, loaded["settings"], METHODS[3])
    assert np.array_equal(a.volume, b.volume), "two identical runs must match exactly"


def test_free_flow_lane_upgrade_changes_nothing(loaded, sample):
    s = loaded["settings"]
    dem = _demand(loaded)
    base = assign(loaded["net"], loaded["graph"], dem, s, METHODS[0])
    up = load_network(sample["network"], s)
    up.lanes[:] = up.lanes * 3
    up.recompute_costs(s)
    g2 = build_csr(up)
    res2 = assign(up, g2, dem, s, METHODS[0])
    assert np.allclose(base.volume, res2.volume), \
        "capacity is ignored at free flow; volumes must be identical"


def test_gravity_demand_positive(loaded):
    s = loaded["settings"]
    s.demand_scale = 1.0
    s.period_factor = 1.0
    dem = build_gravity_demand(loaded["zones"], loaded["zone_node"], s)
    assert dem.kind == "gravity"
    daily = float(productions(loaded["zones"], s).sum())
    assert daily > 0
    res = assign(loaded["net"], loaded["graph"], dem, s, METHODS[1])
    assert res.demand_total > 0


def test_kpis_consistent(loaded):
    dem = _demand(loaded)
    res = assign(loaded["net"], loaded["graph"], dem, loaded["settings"], METHODS[3])
    k = network_kpis(loaded["net"], res)
    assert k.vmt > 0 and k.vht > 0
    assert 0 < k.avg_speed < 200
