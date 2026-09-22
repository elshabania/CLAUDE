"""Run health score, computed exactly as ``config/health.yaml`` describes.

score = weights.findings x findings component + weights.convergence x convergence
component. The findings component starts at 100 and loses ``penalties[severity]``
per *significant* finding, floored at 0. The convergence component is 100 when
every assignment period met the relative-gap target and falls linearly to 0 at
ten times the target (mean over periods). When a run has no convergence data the
findings component carries the full weight, and the component says so.
"""

from __future__ import annotations

from typing import Any

from . import config
from .models import CheckResult, HealthComponent, HealthScore, Severity
from .store import RunStore

_ORDER = [s.value for s in Severity]


def _rel_gap_target() -> float:
    params = (config.checks().get("checks", {}).get("convergence_and_noise", {})
              .get("params", {}))
    return float(params.get("rel_gap_target", 0.001))


def _convergence_component(store: RunStore) -> tuple[float | None, str]:
    """Mean over stage x period of the per-period score; None when no data."""
    if not store.has("convergence"):
        return None, "no convergence table in this run"
    target = _rel_gap_target()
    df = store.query(
        """
        SELECT stage, period, value AS rel_gap FROM convergence c
        WHERE metric = 'REL_GAP' AND iteration = (
            SELECT MAX(iteration) FROM convergence x
            WHERE x.metric = 'REL_GAP' AND x.stage = c.stage
              AND COALESCE(x.period, '') = COALESCE(c.period, ''))
        ORDER BY stage, period
        """
    )
    if df.empty:
        return None, "no REL_GAP records in the convergence table"
    scores = []
    parts = []
    for r in df.itertuples():
        gap = float(r.rel_gap)
        if gap <= target:
            s = 100.0
        else:
            s = max(0.0, 100.0 * (1.0 - (gap - target) / (9.0 * target)))
        scores.append(s)
        parts.append(f"{r.stage} {r.period or ''}: gap {gap:.4f} -> {s:.0f}".replace("  ", " "))
    return sum(scores) / len(scores), (
        f"target {target:g}; per period: " + "; ".join(parts)
    )


def grade_for(score: float, grades: dict[str, Any]) -> str:
    """Letter grade: the highest band whose threshold the score meets."""
    ordered = sorted(grades.items(), key=lambda kv: float(kv[1]), reverse=True)
    for letter, threshold in ordered:
        if score >= float(threshold):
            return str(letter)
    return str(ordered[-1][0]) if ordered else "E"


def compute(store: RunStore, results: list[CheckResult]) -> HealthScore:
    """Compute the HealthScore for a run from its check results and convergence table."""
    cfg = config.health()
    penalties = {str(k): float(v) for k, v in cfg["penalties"].items()}
    weights = {str(k): float(v) for k, v in cfg["weights"].items()}
    grades = cfg["grades"]

    counts = {s: 0 for s in _ORDER}
    penalty_total = 0.0
    for r in results:
        for f in r.findings:
            counts[f.severity.value] = counts.get(f.severity.value, 0) + 1
            if f.is_significant:
                penalty_total += penalties.get(f.severity.value, 0.0)
    findings_score = max(0.0, 100.0 - penalty_total)
    sig = sum(1 for r in results for f in r.findings if f.is_significant)
    findings_detail = (
        f"100 - {penalty_total:g} penalty over {sig} significant finding(s) "
        + "(" + ", ".join(f"{k} {v}" for k, v in counts.items() if v) + ")"
        if sig else "no significant findings"
    )

    conv_score, conv_detail = _convergence_component(store)
    w_f = weights.get("findings", 0.7)
    w_c = weights.get("convergence", 0.3)
    if conv_score is None:
        score = findings_score
        components = [
            HealthComponent(name="findings", score=round(findings_score, 2), weight=1.0,
                            detail=findings_detail + "; carries full weight because "
                            "convergence data is unavailable"),
            HealthComponent(name="convergence", score=0.0, weight=0.0, detail=conv_detail),
        ]
    else:
        total_w = (w_f + w_c) or 1.0
        score = (w_f * findings_score + w_c * conv_score) / total_w
        components = [
            HealthComponent(name="findings", score=round(findings_score, 2), weight=w_f,
                            detail=findings_detail),
            HealthComponent(name="convergence", score=round(conv_score, 2), weight=w_c,
                            detail=conv_detail),
        ]
    score = max(0.0, min(100.0, score))
    return HealthScore(
        run_id=store.run_id,
        score=round(score, 1),
        grade=grade_for(score, grades),
        components=components,
        counts=counts,
        definition=str(cfg["definition"]).strip(),
    )
