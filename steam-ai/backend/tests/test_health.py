"""Tests for the health score against config/health.yaml."""

from __future__ import annotations

import pytest
from fixtures_mini import dummy_finding, make_run, mini_data_dir, mini_tables  # noqa: F401

from steam_ai import config, health
from steam_ai.models import CheckResult, CheckStatus

pytestmark = pytest.mark.usefixtures("mini_data_dir")

def _results(findings: list) -> list[CheckResult]:
    return [CheckResult(check_id="x", check_name="x", status=CheckStatus.OK, findings=findings)]


def test_clean_run_scores_100() -> None:
    store = make_run("r", mini_tables())
    h = health.compute(store, _results([]))
    assert h.score == 100.0 and h.grade == "A"
    assert h.definition == config.health()["definition"].strip()
    assert [c.name for c in h.components] == ["findings", "convergence"]
    assert h.counts == {"Critical": 0, "High": 0, "Medium": 0, "Info": 0}
    assert h.components[1].score == 100.0 and h.components[1].weight == 0.3


def test_penalties_count_significant_findings_only() -> None:
    store = make_run("r", mini_tables())
    findings = [
        dummy_finding("a", "Critical", loc_id="1"),
        dummy_finding("a", "High", loc_id="2"),
        dummy_finding("a", "Medium", loc_id="3", is_significant=False),
        dummy_finding("a", "Info", loc_id="4"),
    ]
    h = health.compute(store, _results(findings))
    assert h.components[0].score == pytest.approx(100 - 25 - 8)
    assert h.score == pytest.approx(0.7 * 67 + 0.3 * 100, abs=0.05)
    assert h.grade == "B"
    assert h.counts == {"Critical": 1, "High": 1, "Medium": 1, "Info": 1}


def test_convergence_component_scales_to_zero_at_ten_times_target() -> None:
    t = mini_tables()
    conv = t["convergence"]
    conv.loc[(conv["period"] == "AM") & (conv["iteration"] == 5), "value"] = 0.02
    store = make_run("r", t)
    h = health.compute(store, _results([]))
    conv_comp = h.components[1]
    assert conv_comp.score == pytest.approx(50.0)  # AM -> 0, PM -> 100
    assert h.score == pytest.approx(0.7 * 100 + 0.3 * 50, abs=0.05)
    assert "AM" in conv_comp.detail


def test_partial_convergence_is_linear() -> None:
    t = mini_tables()
    conv = t["convergence"]
    # gap = 5.5 x target -> halfway between target and 10 x target -> 50 for AM
    conv.loc[(conv["period"] == "AM") & (conv["iteration"] == 5), "value"] = 0.0055
    store = make_run("r", t)
    h = health.compute(store, _results([]))
    assert h.components[1].score == pytest.approx(75.0)


def test_without_convergence_table_findings_carry_full_weight() -> None:
    t = mini_tables()
    t.pop("convergence")
    t.pop("iteration_flows")
    store = make_run("r", t)
    h = health.compute(store, _results([dummy_finding("a", "High")]))
    assert h.components[0].weight == 1.0 and h.components[1].weight == 0.0
    assert h.score == pytest.approx(92.0)
    assert "unavailable" in h.components[0].detail


def test_findings_component_floors_at_zero() -> None:
    store = make_run("r", mini_tables())
    findings = [dummy_finding("a", "Critical", loc_id=str(i)) for i in range(5)]
    h = health.compute(store, _results(findings))
    assert h.components[0].score == 0.0
    assert h.score == pytest.approx(30.0)
    assert h.grade == "E"


def test_grade_thresholds() -> None:
    grades = config.health()["grades"]
    assert health.grade_for(90, grades) == "A"
    assert health.grade_for(89.9, grades) == "B"
    assert health.grade_for(60, grades) == "C"
    assert health.grade_for(40, grades) == "D"
    assert health.grade_for(0, grades) == "E"
