"""Large populations of one issue are summarised (checks/registry.py)."""

from __future__ import annotations

import pytest
from fixtures_mini import dummy_finding, make_run, mini_data_dir, mini_tables  # noqa: F401

from steam_ai.checks.registry import REGISTRY, _group_large_issues

pytestmark = pytest.mark.usefixtures("mini_data_dir")


def test_large_issue_is_grouped_keeping_the_worst() -> None:
    store = make_run("r", mini_tables())
    check = REGISTRY["network_connectivity"]
    fs = [dummy_finding("network_connectivity", "High", loc_type="node", loc_id=str(i),
                        values={"issue": "disconnected_component", "component_size": 100 - i})
          for i in range(40)]
    fs.insert(5, dummy_finding("network_connectivity", "Critical", loc_type="node",
                               loc_id="999", values={"issue": "disconnected_component",
                                                     "component_size": 1}))
    fs.append(dummy_finding("network_connectivity", "Medium", loc_id="7",
                            values={"issue": "orphan_node"}))
    out, note = _group_large_issues(store, check, fs)
    assert note and "41 occurrences" in note.replace(",", "")
    summary = [f for f in out if f.evidence.values.get("n_occurrences")]
    assert len(summary) == 1
    s = summary[0]
    assert s.evidence.values["n_occurrences"] == 41 and s.evidence.values["n_listed"] == 10
    assert s.severity.value == "Critical" and "separate network fragments" in s.executive_line
    kept = [f for f in out if f.evidence.values.get("issue") == "disconnected_component"
            and not f.evidence.values.get("n_occurrences")]
    # the Critical one, then the nine largest Highs in the check's own order
    assert [f.location.id for f in kept] == ["999"] + [str(i) for i in range(9)]
    assert any(f.evidence.values.get("issue") == "orphan_node" for f in out)
    assert out[0] is s  # summaries lead within their severity


def test_small_issue_is_left_alone() -> None:
    store = make_run("r", mini_tables())
    fs = [dummy_finding("network_connectivity", "High", loc_id=str(i),
                        values={"issue": "zero_capacity"}) for i in range(5)]
    out, note = _group_large_issues(store, REGISTRY["network_connectivity"], fs)
    assert note is None and out == fs
