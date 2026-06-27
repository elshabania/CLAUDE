"""Offline copilot interpreter: every section-5 example phrase must produce the
correct command(s)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from steam.copilot.interpreter import interpret


def cmds(text):
    return [(c["command"], c["params"]) for c in interpret(text)]


def test_am_peak_equilibrium():
    c = cmds("run an AM peak equilibrium assignment on the loaded matrix")
    assert c == [("run_assignment",
                  {"method": "fw", "demand": "od", "period": "am_peak"})]


def test_gravity_then_free_flow():
    c = cmds("build demand from land use with 2.5 trips per resident then run free-flow")
    assert c[0][0] == "build_gravity_demand"
    assert c[0][1]["r_pop"] == 2.5
    assert c[1] == ("run_assignment", {"method": "aon", "demand": "gravity"})


def test_aggregate_phrase():
    c = cmds("aggregate to 1500 zones, don't cross collectors, max 6 km")
    assert c[0][0] == "aggregate"
    p = c[0][1]
    assert p["target"] == 1500
    assert p["barrier"] == "coll"
    assert p["max_span_m"] == 6000.0


def test_worst_corridors_and_recommend():
    c = cmds("show me the worst ten corridors and recommend fixes")
    names = [x[0] for x in c]
    assert "query" in names and "recommend" in names


def test_vht_query():
    c = cmds("what's the network VHT now?")
    assert c == [("query", {"metric": "vht"})]


def test_chained_aggregate_then_assign():
    c = cmds("aggregate to 1500 zones avoiding collectors then run an AM peak "
             "frank-wolfe assignment and show the top 10 congested corridors")
    names = [x[0] for x in c]
    assert names[0] == "aggregate"
    assert "run_assignment" in names


def test_workspace_navigation_not_assignment():
    c = cmds("open assignment workspace")
    assert c == [("goto_workspace", {"name": "assignment"})]


def test_colour_by():
    assert cmds("colour by los") == [("colour_by", {"mode": "los"})]
