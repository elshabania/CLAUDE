"""Tests for the safe severity-rule evaluator."""

from __future__ import annotations

import math

import pytest

from steam_ai.checks.base import evaluate_expression, evaluate_severity, finding_id
from steam_ai.models import Severity

RULES = [
    {"when": "vc_ratio >= 1.30", "severity": "Critical"},
    {"when": "vc_ratio >= 1.10", "severity": "High"},
    {"when": "abs_zscore >= 4.0", "severity": "High"},
    {"when": "vc_ratio >= 0.95 or abs_zscore >= 3.0", "severity": "Medium"},
]


def test_first_matching_rule_wins() -> None:
    assert evaluate_severity(RULES, vc_ratio=1.5, abs_zscore=0) is Severity.CRITICAL
    assert evaluate_severity(RULES, vc_ratio=1.2, abs_zscore=0) is Severity.HIGH
    assert evaluate_severity(RULES, vc_ratio=0.96, abs_zscore=0) is Severity.MEDIUM
    assert evaluate_severity(RULES, vc_ratio=0.5, abs_zscore=3.5) is Severity.MEDIUM
    assert evaluate_severity(RULES, vc_ratio=0.5, abs_zscore=4.5) is Severity.HIGH
    assert evaluate_severity(RULES, vc_ratio=0.5, abs_zscore=1.0) is None


def test_string_equality_and_or() -> None:
    rules = [
        {"when": "issue == 'zero_capacity' or issue == 'zero_speed'", "severity": "Critical"},
        {"when": "issue != 'orphan_node'", "severity": "High"},
    ]
    assert evaluate_severity(rules, issue="zero_speed") is Severity.CRITICAL
    assert evaluate_severity(rules, issue="dead_end") is Severity.HIGH
    assert evaluate_severity(rules, issue="orphan_node") is None


def test_bare_variable_truthiness_and_not() -> None:
    rules = [{"when": "drifted", "severity": "High"}]
    assert evaluate_severity(rules, drifted=True) is Severity.HIGH
    assert evaluate_severity(rules, drifted=False) is None
    assert evaluate_severity(rules) is None
    assert evaluate_expression("not explained and shift_share > 0.1", explained=False,
                               shift_share=0.2) is True
    assert evaluate_expression("not explained and shift_share > 0.1", explained=True,
                               shift_share=0.2) is False


def test_missing_and_nan_variables_never_match_ordered_comparisons() -> None:
    assert evaluate_severity(RULES, abs_zscore=None) is None
    assert evaluate_severity(RULES, vc_ratio=float("nan"), abs_zscore=math.nan) is None
    assert evaluate_expression("x == None") is True


def test_arithmetic_functions_and_chained_comparison() -> None:
    assert evaluate_expression("abs(x) > 2 and x / y < 1", x=-3, y=-5) is True
    assert evaluate_expression("0.5 < x <= 1", x=1) is True
    assert evaluate_expression("0.5 < x <= 1", x=1.5) is False
    assert evaluate_expression("max(a, b) - min(a, b) >= 2", a=1, b=3) is True
    assert evaluate_expression("round(x) == 3", x=2.6) is True
    assert evaluate_expression("x / 0 > 1", x=1) is False  # division by zero -> None


@pytest.mark.parametrize(
    "expr",
    [
        "__import__('os').system('echo hi')",
        "x.__class__",
        "x[0]",
        "(lambda: 1)()",
        "open('f')",
        "[1, 2]",
        "{'a': 1}",
        "x if y else z",
        "x ** 2",
        "f'{x}'",
        "abs(x, key=1)",
    ],
)
def test_unsafe_or_unsupported_expressions_are_rejected(expr: str) -> None:
    with pytest.raises((ValueError, SyntaxError)):
        evaluate_expression(expr, x=1, y=2, z=3)


def test_unknown_severity_name_raises() -> None:
    with pytest.raises(ValueError):
        evaluate_severity([{"when": "x > 0", "severity": "Bogus"}], x=1)


def test_finding_id_is_deterministic_and_excludes_run_id() -> None:
    a = finding_id("c", "link", "1", "AM")
    assert a == finding_id("c", "link", "1", "AM")
    assert len(a) == 12
    assert a != finding_id("c", "link", "1", "PM")
    assert a != finding_id("c", "link", "1", "AM", "other")
