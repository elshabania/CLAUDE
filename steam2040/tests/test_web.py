"""Tests for the FastAPI web backend (engine over HTTP)."""

import time

import numpy as np
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from steam_app.state import AppState
from steam_core import Settings, load_network, load_zones, load_od_long
from steam_core.zonemap import build_zone_node_map
from steam_app.web.server import create_app


@pytest.fixture(scope="module")
def client(sample):
    s = Settings()
    s.demand_scale = 0.1
    state = AppState()
    state.settings = s
    state.network = load_network(sample["network"], s)
    from steam_core import build_csr
    from steam_assignment.scenario import NetworkEditor
    state.editor = NetworkEditor(state.network, s)
    state.graph = build_csr(state.network)
    state.zones = load_zones(sample["zones"])
    state.zone_node = build_zone_node_map(state.zones, state.network)
    state.od = load_od_long(sample["od"])
    return TestClient(create_app(state))


def test_status_and_geometry(client):
    st = client.get("/api/status").json()
    assert st["network"] > 0 and st["zones"] > 0
    meta = client.get("/api/network/meta").json()
    n = meta["n_links"]
    off = np.frombuffer(client.get("/api/network/offsets").content, np.int32)
    xy = np.frombuffer(client.get("/api/network/xy").content, np.float32)
    assert len(off) == n + 1
    assert len(xy) == meta["n_points"] * 2
    style = client.get("/api/style/class").content
    assert len(style) == 5 * n


def test_assignment_flow(client):
    r = client.post("/api/assignment/run",
                    json={"method": "Frank-Wolfe UE", "demand_source": "Loaded OD matrix"})
    assert r.json()["started"]
    for _ in range(120):
        s = client.get("/api/assignment/state").json()
        if s["done"]:
            break
        time.sleep(0.2)
    assert s["error"] is None
    assert s["kpis"]
    assert len(client.get("/api/style/volume").content) > 0
    rows = client.get("/api/top_links?n=5").json()["rows"]
    assert rows and "vc" in rows[0]


def test_aggregate_endpoint(client):
    st = client.post("/api/aggregate",
                     json={"target_zone_count": 80, "barrier_threshold": "coll",
                           "max_span_m": 6000, "method": "single",
                           "keys": ["district"]}).json()
    assert st["clusters_out"] <= st["zones_in"]
    labels = np.frombuffer(client.get("/api/aggregation/labels").content, np.int32)
    assert len(labels) == client.get("/api/status").json()["zones"]
    qa = client.get("/api/aggregation/qa").json()
    assert "n_non_contiguous" in qa


def test_chat_endpoint(client):
    r = client.post("/api/chat", json={"message": "show top 3 congested links"}).json()
    assert r["backend"] in ("offline", "ollama", "claude")
    assert any(a["capability"] == "top_congested_links" for a in r["actions"])
