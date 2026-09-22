"""End-to-end API test on a processed synthetic run."""

from __future__ import annotations

import pytest

pytest.importorskip("steam_ai.synthetic.generate")
pytest.importorskip("steam_ai.checks.registry")

from fastapi.testclient import TestClient  # noqa: E402

from steam_ai.api.app import API_PREFIX, app  # noqa: E402
from steam_ai.pipeline import run_checks  # noqa: E402


@pytest.fixture(scope="module")
def processed_run(ingested_run):
    store = ingested_run({"overcapacity_corridor", "zero_capacity_link", "headway_out_of_range"})
    run_checks(store.run_id, make_report=False)
    return store.run_id


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_runs_listed(client, processed_run):
    r = client.get(f"{API_PREFIX}/runs")
    assert r.status_code == 200
    ids = [x["run_id"] for x in r.json()]
    assert processed_run in ids
    me = next(x for x in r.json() if x["run_id"] == processed_run)
    assert me["is_synthetic"] is True
    assert me["health"] is not None and 0 <= me["health"]["score"] <= 100


def test_findings_paginate_and_filter(client, processed_run):
    r = client.get(f"{API_PREFIX}/runs/{processed_run}/findings", params={"limit": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1 and len(body["items"]) <= 5
    first = body["items"][0]
    for key in ("finding_id", "severity", "executive_line", "modeller_view", "evidence"):
        assert key in first
    assert first["evidence"]["sources"], "every finding must cite a source file"
    r2 = client.get(f"{API_PREFIX}/runs/{processed_run}/findings",
                    params={"severity": "Critical"})
    assert all(f["severity"] == "Critical" for f in r2.json()["items"])


def test_links_geojson(client, processed_run):
    r = client.get(f"{API_PREFIX}/runs/{processed_run}/links", params={"period": "AM"})
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) > 100
    props = fc["features"][0]["properties"]
    assert {"link_id", "vc_ratio", "volume", "n_findings"} <= set(props)
    lid = props["link_id"]
    p = client.get(f"{API_PREFIX}/runs/{processed_run}/links/{lid}")
    assert p.status_code == 200 and p.json()["attributes"]["link_id"] == lid
    assert len(p.json()["flows"]) > 0


def test_kpis_checks_catalogue(client, processed_run):
    assert client.get(f"{API_PREFIX}/runs/{processed_run}/kpis").status_code == 200
    checks = client.get(f"{API_PREFIX}/runs/{processed_run}/checks").json()
    assert any(c["status"] == "ok" for c in checks)
    cat = client.get(f"{API_PREFIX}/checks").json()
    assert {c["check_id"] for c in cat} >= {"link_volume_outliers", "network_connectivity"}


def test_unknown_run_404(client):
    assert client.get(f"{API_PREFIX}/runs/nope/health").status_code == 404
