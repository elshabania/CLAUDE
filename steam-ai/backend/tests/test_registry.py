"""Tests for the check registry and runner."""

from __future__ import annotations

import copy

import pandas as pd
import pytest
from fixtures_mini import make_run, mini_data_dir, mini_tables  # noqa: F401

from steam_ai import audit, config
from steam_ai.checks import registry
from steam_ai.checks.base import Check
from steam_ai.models import CheckStatus

pytestmark = pytest.mark.usefixtures("mini_data_dir")

def _patched_config(monkeypatch: pytest.MonkeyPatch, **edits):
    cfg = copy.deepcopy(config.checks())
    for check_id, changes in edits.items():
        if check_id == "defaults":
            cfg["defaults"].update(changes)
        else:
            cfg["checks"][check_id].update(changes)
    monkeypatch.setattr(config, "checks", lambda: cfg)
    return cfg


def test_run_all_on_clean_run_has_no_findings() -> None:
    base = make_run("base", mini_tables())
    store = make_run("scen", mini_tables(), base_run_id="base")
    results = registry.run_all(store, base)
    assert [r.check_id for r in results] == list(config.checks()["checks"])
    assert all(r.status is CheckStatus.OK for r in results), [
        (r.check_id, r.status, r.message) for r in results]
    assert sum(len(r.findings) for r in results) == 0
    assert all(r.duration_s >= 0 for r in results)
    assert sum(r.rows_examined for r in results) > 0
    events = [e for e in audit.tail(200) if e["event"] == "check_run" and e["run_id"] == "scen"]
    assert {e["check_id"] for e in events} == set(config.checks()["checks"])


def test_missing_tables_skip_with_message() -> None:
    t = mini_tables()
    for name in ("transit_lines", "transit_segments", "line_loads", "control_totals"):
        t.pop(name)
    store = make_run("r", t)
    by_id = {r.check_id: r for r in registry.run_all(store, None)}
    assert by_id["transit_line_integrity"].status is CheckStatus.SKIPPED
    assert "transit_lines" in by_id["transit_line_integrity"].message
    assert by_id["unused_transit_services"].status is CheckStatus.SKIPPED
    assert by_id["land_use_control_totals"].status is CheckStatus.SKIPPED
    assert by_id["network_connectivity"].status is CheckStatus.OK


def test_needs_base_skips_without_base() -> None:
    store = make_run("r", mini_tables())
    by_id = {r.check_id: r for r in registry.run_all(store, None)}
    assert by_id["unexplained_demand_shift"].status is CheckStatus.SKIPPED
    assert "base" in by_id["unexplained_demand_shift"].message
    assert by_id["trip_length_distribution"].status is CheckStatus.SKIPPED


def test_reference_means_let_trip_length_run_without_base(monkeypatch) -> None:
    _patched_config(monkeypatch, trip_length_distribution={
        "params": {**config.checks()["checks"]["trip_length_distribution"]["params"],
                   "reference_mean_km": {"HBW/CAR": 100.0}}})
    store = make_run("r", mini_tables())
    by_id = {r.check_id: r for r in registry.run_all(store, None, only=["trip_length_distribution"])}
    r = by_id["trip_length_distribution"]
    assert r.status is CheckStatus.OK and len(r.findings) == 1
    assert r.findings[0].evidence.values["comparison"] == "configured reference means"


def test_disabled_check_is_skipped(monkeypatch) -> None:
    _patched_config(monkeypatch, parameter_drift={"enabled": False})
    store = make_run("r", mini_tables())
    by_id = {r.check_id: r for r in registry.run_all(store, None)}
    assert by_id["parameter_drift"].status is CheckStatus.SKIPPED
    assert "disabled" in by_id["parameter_drift"].message


def test_exception_becomes_error_result(monkeypatch) -> None:
    class Boom(Check):
        check_id = "parameter_drift"
        name = "boom"
        required_tables = {"parameters"}

        def run(self, store, base, params, severity_rules):
            raise RuntimeError("kaboom")

    monkeypatch.setitem(registry.REGISTRY, "parameter_drift", Boom())
    store = make_run("r", mini_tables())
    results = registry.run_all(store, None)
    by_id = {r.check_id: r for r in results}
    assert by_id["parameter_drift"].status is CheckStatus.ERROR
    assert "kaboom" in by_id["parameter_drift"].message
    assert by_id["network_connectivity"].status is CheckStatus.OK
    assert any(e["event"] == "check_error" for e in audit.tail(50))


def test_only_filter_and_unregistered_check(monkeypatch) -> None:
    cfg = _patched_config(monkeypatch)
    cfg["checks"]["not_implemented"] = {"enabled": True, "params": {}, "severity": []}
    store = make_run("r", mini_tables())
    results = registry.run_all(store, None, only=["parameter_drift", "not_implemented"])
    assert [r.check_id for r in results] == ["parameter_drift", "not_implemented"]
    assert results[1].status is CheckStatus.SKIPPED
    assert "no implementation" in results[1].message


def test_findings_are_capped_keeping_most_severe(monkeypatch) -> None:
    _patched_config(monkeypatch, defaults={"max_findings_per_check": 2})
    t = mini_tables()
    nodes = t["nodes"]
    extra = nodes.iloc[[0, 0, 0]].copy()
    extra["node_id"] = [50, 51, 52]  # three orphan nodes -> Medium
    t["nodes"] = pd.concat([nodes, extra])
    t["links"].loc[t["links"]["link_id"] == 2, "capacity_vph"] = 0.0  # Critical
    store = make_run("r", t)
    r = registry.run_all(store, None, only=["network_connectivity"])[0]
    assert r.status is CheckStatus.OK
    assert len(r.findings) == 2
    assert r.findings[0].severity.value == "Critical"
    assert "capped at 2 of 4" in r.message


def test_catalogue_describes_every_check() -> None:
    cat = registry.catalogue()
    assert [c["id"] for c in cat] == list(config.checks()["checks"])
    for c in cat:
        assert c["implemented"] and c["name"] and c["description"]
        assert isinstance(c["required_tables"], list) and c["required_tables"]
        assert isinstance(c["severity"], list) and c["severity"]
        assert isinstance(c["params"], dict)
        assert isinstance(c["needs_base"], bool) and isinstance(c["enabled"], bool)
    by_id = {c["id"]: c for c in cat}
    assert by_id["unexplained_demand_shift"]["needs_base"] is True
    assert by_id["network_connectivity"]["needs_base"] is False
