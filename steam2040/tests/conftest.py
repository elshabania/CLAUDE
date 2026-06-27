"""Shared pytest fixtures: build synthetic sample data once per session."""

import pytest

from tools.make_sample_data import build
from steam_core import Settings, load_network, load_zones, load_od_long, build_csr
from steam_core.zonemap import build_zone_node_map
from steam_core.kernels import warmup


@pytest.fixture(scope="session")
def sample(tmp_path_factory):
    out = tmp_path_factory.mktemp("sample")
    stats = build(out, grid=16, seed=7)
    return {"dir": out, "stats": stats,
            "network": str(out / "sample_network.shp"),
            "zones": str(out / "sample_landuse.csv"),
            "od": str(out / "sample_od.csv")}


@pytest.fixture(scope="session")
def loaded(sample):
    warmup()
    s = Settings()
    s.demand_scale = 0.1
    net = load_network(sample["network"], s)
    zones = load_zones(sample["zones"])
    od = load_od_long(sample["od"])
    zone_node = build_zone_node_map(zones, net)
    graph = build_csr(net)
    return {"settings": s, "net": net, "zones": zones, "od": od,
            "zone_node": zone_node, "graph": graph}
