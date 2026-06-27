"""Tests for the merged controller, capability registry and assistant."""

from steam_app import AppState, build_registry, Assistant
from steam_app.assistant import OfflineBackend


def _state(sample):
    s = AppState()
    s.settings.demand_scale = 0.1
    s.load_network(sample["network"])
    s.load_zones(sample["zones"])
    s.load_matrix(sample["od"])
    return s


def test_controller_assignment_and_aggregation(sample):
    s = _state(sample)
    res = s.run_assignment("Frank-Wolfe UE", "Loaded OD matrix")
    assert res.iterations >= 1
    k = s.kpis()
    assert k.vmt > 0
    agg = s.aggregate_zones(target_zone_count=100)
    assert agg.n_clusters <= s.zones.n


def test_capability_registry_invoke(sample):
    s = _state(sample)
    reg = build_registry()
    out = reg.invoke(s, "run_assignment",
                     {"method": "MSA", "demand_source": "Loaded OD matrix"})
    assert "VHT" in out
    out2 = reg.invoke(s, "aggregate_zones", {"target_zone_count": 80})
    assert "clusters" in out2
    out3 = reg.invoke(s, "status", {})
    assert "Network" in out3


def test_offline_assistant_chains_actions(sample):
    s = _state(sample)
    bot = Assistant(s, build_registry(), prefer="offline")
    assert isinstance(bot.backend, OfflineBackend)
    reply = bot.chat("run frank-wolfe with the matrix")
    assert reply.actions and reply.actions[0].capability == "run_assignment"
    reply2 = bot.chat("aggregate to 90 zones with collector barriers")
    assert reply2.actions[0].capability == "aggregate_zones"
    assert s.aggregation is not None


def test_offline_assistant_scenario(sample):
    s = _state(sample)
    s.run_assignment("Frank-Wolfe UE", "Loaded OD matrix")
    worst = int(s.network.link_id[s.result.vc.argmax()])
    bot = Assistant(s, build_registry(), prefer="offline")
    reply = bot.chat(f"upgrade link {worst} by 2 lanes and run the scenario")
    caps = [a.capability for a in reply.actions]
    assert "upgrade_link" in caps and "run_scenario" in caps
