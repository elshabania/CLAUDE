"""parameter_drift on mini fixtures."""

from __future__ import annotations

import pytest
from fixtures_mini import mini_data_dir, mini_tables, run_check  # noqa: F401

pytestmark = pytest.mark.usefixtures("mini_data_dir")

CHECK = "parameter_drift"


def _set(t: dict, key: str, value: str | None = None, approved: str | None = "keep") -> None:
    par = t["parameters"]
    if value is not None:
        par.loc[par["key"] == key, "value"] = value
    if approved != "keep":
        par.loc[par["key"] == key, "approved_value"] = approved


def test_clean_register_has_no_findings() -> None:
    assert run_check(CHECK, mini_tables()) == []


def test_numeric_drift() -> None:
    t = mini_tables()
    _set(t, "VOT_CAR", value="2.0")
    fs = run_check(CHECK, t)
    assert len(fs) == 1
    f = fs[0]
    assert f.severity.value == "High"
    assert f.location.type.value == "run" and "VOT_CAR" in (f.location.label or "")
    v = f.evidence.values
    assert (v["key"], v["value"], v["approved_value"]) == ("VOT_CAR", "2.0", "1.5")
    assert abs(v["change_share"] - 1 / 3) < 1e-9
    assert f.evidence.sources[0].table == "parameters" and f.evidence.sources[0].row == 1
    assert "VOT_CAR" in f.executive_line and "1.5" in f.executive_line


def test_numerically_equal_strings_do_not_drift() -> None:
    t = mini_tables()
    _set(t, "VOT_CAR", value="1.50")
    _set(t, "BPR_ALPHA", value=" 0.15 ")
    assert run_check(CHECK, t) == []


def test_text_drift_and_null_approved() -> None:
    t = mini_tables()
    _set(t, "RUN_NOTE", value="abc", approved="abd")
    _set(t, "BPR_ALPHA", value="0.2", approved=None)  # no approved value -> ignored
    fs = run_check(CHECK, t)
    assert [f.evidence.values["key"] for f in fs] == ["RUN_NOTE"]
    assert fs[0].evidence.values["change_share"] is None


def test_two_drifts_have_distinct_ids() -> None:
    t = mini_tables()
    _set(t, "VOT_CAR", value="2.0")
    _set(t, "BPR_ALPHA", value="0.3")
    fs = run_check(CHECK, t)
    assert len({f.finding_id for f in fs}) == 2
