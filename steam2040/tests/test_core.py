"""Tests for the shared core: classification, loaders, CSR, kernels, cache."""

import numpy as np

from steam_core import (Settings, load_network, classify_ltype, FACILITY_CLASSES,
                        build_csr, save_network_cache, load_network_cache)
from steam_core.classify import NONROAD, PROTECTED_LTYPES, barrier_classes_for


def test_classification_bands():
    assert classify_ltype(5) == FACILITY_CLASSES.index("fwy")
    assert classify_ltype(20) == FACILITY_CLASSES.index("art")
    assert classify_ltype(24) == FACILITY_CLASSES.index("coll")
    assert classify_ltype(28) == FACILITY_CLASSES.index("local")
    for lt in PROTECTED_LTYPES:
        assert classify_ltype(lt) == NONROAD


def test_barrier_classes_monotone():
    fwy = barrier_classes_for("fwy")
    art = barrier_classes_for("art")
    coll = barrier_classes_for("coll")
    assert fwy <= art <= coll  # collectors+ is the widest barrier set


def test_network_loads_and_filters(loaded):
    net = loaded["net"]
    assert net.n_links > 0
    assert net.n_nodes > 0
    # capacity and free-flow time are derived and positive
    assert (net.capacity > 0).all()
    assert (net.fftime > 0).all()
    # no protected/rail classes survived
    assert (net.klass >= 0).all()


def test_capacity_formula(loaded):
    net, s = loaded["net"], loaded["settings"]
    i = 0
    from steam_core.classify import class_name
    cname = class_name(net.klass[i])
    expected = max(1, int(net.lanes[i])) * s.cap_per_lane(cname)
    assert abs(net.capacity[i] - expected) < 1e-6


def test_csr_edges(loaded):
    net, g = loaded["net"], loaded["graph"]
    twoway = int((~net.oneway).sum())
    assert g.n_edges == net.n_links + twoway
    assert g.indptr[-1] == g.n_edges


def test_cache_roundtrip(tmp_path, sample):
    s = Settings()
    net = load_network(sample["network"], s)
    cache = tmp_path / "net.npz"
    save_network_cache(net, cache, source=sample["network"])
    back = load_network_cache(cache, source=sample["network"])
    assert back is not None
    assert back.n_links == net.n_links
    assert np.array_equal(back.klass, net.klass)
    # stale source detection
    assert load_network_cache(cache, source=sample["zones"]) is None


def test_dijkstra_kernel(loaded):
    from steam_core.kernels import aon_fixed
    g, net = loaded["graph"], loaded["net"]
    g.set_weights_from_link_time(net.fftime)
    origins = np.array([0], dtype=np.int64)
    head = np.array([0, 1], dtype=np.int64)
    dnode = np.array([net.n_nodes - 1], dtype=np.int64)
    dtrip = np.array([10.0])
    ef, sptt = aon_fixed(g.indptr, g.indices, g.weight, net.n_nodes,
                         origins, head, dnode, dtrip)
    assert sptt > 0
    assert (g.link_volume_from_edges(ef) > 0).sum() > 0
