"""Registry of checks and the runner used by the pipeline and the API.

``run_all`` never raises: a check that cannot run is reported as SKIPPED, one
that crashes as ERROR, and the remaining checks still run.
"""

from __future__ import annotations

import time
import traceback
from typing import Any

from .. import audit, config
from ..models import CheckResult, CheckStatus, Finding, Location, LocationType, Severity
from ..store import RunStore
from .base import Check, SkipCheck, make_finding
from .centroid_connectors import CentroidConnectors
from .convergence_and_noise import ConvergenceAndNoise
from .land_use_control_totals import LandUseControlTotals
from .link_volume_outliers import LinkVolumeOutliers
from .matrix_sanity import MatrixSanity
from .network_connectivity import NetworkConnectivity
from .null_and_id_integrity import NullAndIdIntegrity
from .parameter_drift import ParameterDrift
from .transit_line_integrity import TransitLineIntegrity
from .trip_length_distribution import TripLengthDistribution
from .unexplained_demand_shift import UnexplainedDemandShift
from .unrealistic_speeds_times import UnrealisticSpeedsTimes
from .unused_transit_services import UnusedTransitServices

REGISTRY: dict[str, Check] = {
    c.check_id: c
    for c in (
        NullAndIdIntegrity(),
        NetworkConnectivity(),
        CentroidConnectors(),
        TransitLineIntegrity(),
        LandUseControlTotals(),
        LinkVolumeOutliers(),
        ConvergenceAndNoise(),
        MatrixSanity(),
        TripLengthDistribution(),
        UnrealisticSpeedsTimes(),
        ParameterDrift(),
        UnexplainedDemandShift(),
        UnusedTransitServices(),
    )
}


def _ordered_ids(cfg: dict[str, Any]) -> list[str]:
    configured = list((cfg.get("checks") or {}).keys())
    return configured + [c for c in REGISTRY if c not in configured]


def _cap(findings: list[Finding], limit: int) -> tuple[list[Finding], str | None]:
    findings = sorted(findings, key=lambda f: (f.severity.rank, f.finding_id))
    if len(findings) <= limit:
        return findings, None
    return findings[:limit], (
        f"capped at {limit} of {len(findings)} findings (most severe kept)"
    )


def run_all(
    store: RunStore, base: RunStore | None = None, only: list[str] | None = None
) -> list[CheckResult]:
    """Run every enabled check on ``store`` and return one CheckResult per check.

    ``base`` is the base run for comparison checks (None -> those are SKIPPED).
    ``only`` restricts the run to the listed check ids.
    """
    cfg = config.checks()
    defaults = cfg.get("defaults") or {}
    max_findings = int(defaults.get("max_findings_per_check", 200))
    default_enabled = bool(defaults.get("enabled", True))
    results: list[CheckResult] = []
    for check_id in _ordered_ids(cfg):
        if only is not None and check_id not in only:
            continue
        ccfg: dict[str, Any] = (cfg.get("checks") or {}).get(check_id) or {}
        check = REGISTRY.get(check_id)
        if check is None:
            results.append(CheckResult(check_id=check_id, check_name=check_id,
                                       status=CheckStatus.SKIPPED,
                                       message="configured but no implementation registered"))
            continue
        result = _run_one(store, base, check, ccfg, default_enabled, max_findings)
        results.append(result)
        audit.record(
            "check_run", run_id=store.run_id, check_id=check_id, status=result.status.value,
            n_findings=len(result.findings), duration_s=result.duration_s,
            message=result.message,
        )
    return results


def _run_one(
    store: RunStore,
    base: RunStore | None,
    check: Check,
    ccfg: dict[str, Any],
    default_enabled: bool,
    max_findings: int,
) -> CheckResult:
    if not ccfg.get("enabled", default_enabled):
        return CheckResult(check_id=check.check_id, check_name=check.name,
                           status=CheckStatus.SKIPPED, message="disabled in config")
    if not ccfg:
        return CheckResult(check_id=check.check_id, check_name=check.name,
                           status=CheckStatus.SKIPPED, message="not present in checks.yaml")
    missing = sorted(t for t in check.required_tables if not store.has(t))
    if missing:
        return CheckResult(check_id=check.check_id, check_name=check.name,
                           status=CheckStatus.SKIPPED,
                           message="required table(s) missing: " + ", ".join(missing))
    params: dict[str, Any] = ccfg.get("params") or {}
    if check.needs_base and base is None and not check.base_optional_with(params):
        return CheckResult(check_id=check.check_id, check_name=check.name,
                           status=CheckStatus.SKIPPED,
                           message="needs a base run and none is linked to this run")
    if check.needs_base and base is not None:
        missing_base = sorted(t for t in check.required_tables if not base.has(t))
        if missing_base:
            return CheckResult(check_id=check.check_id, check_name=check.name,
                               status=CheckStatus.SKIPPED,
                               message="base run lacks table(s): " + ", ".join(missing_base))
    rules: list[dict[str, Any]] = ccfg.get("severity") or []
    check.rows_examined = 0
    check.message = None
    t0 = time.perf_counter()
    try:
        findings = check.run(store, base, params, rules)
    except SkipCheck as exc:
        return CheckResult(check_id=check.check_id, check_name=check.name,
                           status=CheckStatus.SKIPPED, message=str(exc),
                           duration_s=round(time.perf_counter() - t0, 3))
    except Exception as exc:  # noqa: BLE001 - a broken check must not stop the pipeline
        audit.record("check_error", run_id=store.run_id, check_id=check.check_id,
                     error=f"{type(exc).__name__}: {exc}", traceback=traceback.format_exc())
        return CheckResult(check_id=check.check_id, check_name=check.name,
                           status=CheckStatus.ERROR, message=f"{type(exc).__name__}: {exc}",
                           duration_s=round(time.perf_counter() - t0, 3),
                           rows_examined=check.rows_examined)
    findings, group_msg = _group_large_issues(store, check, list(findings))
    findings, cap_msg = _cap(findings, max_findings)
    messages = [m for m in (check.message, group_msg, cap_msg) if m]
    return CheckResult(
        check_id=check.check_id, check_name=check.name, status=CheckStatus.OK,
        findings=findings, message="; ".join(messages) or None,
        duration_s=round(time.perf_counter() - t0, 3), rows_examined=check.rows_examined,
    )


def catalogue() -> list[dict[str, Any]]:
    """Describe every check for the API: identity, needs, and current configuration."""
    cfg = config.checks()
    defaults = cfg.get("defaults") or {}
    default_enabled = bool(defaults.get("enabled", True))
    out: list[dict[str, Any]] = []
    for check_id in _ordered_ids(cfg):
        ccfg: dict[str, Any] = (cfg.get("checks") or {}).get(check_id) or {}
        check = REGISTRY.get(check_id)
        out.append({
            "id": check_id,
            "name": check.name if check else check_id,
            "description": check.description if check else "(no implementation registered)",
            "required_tables": sorted(check.required_tables) if check else [],
            "needs_base": bool(check.needs_base) if check else False,
            "implemented": check is not None,
            "enabled": bool(ccfg.get("enabled", default_enabled)) if ccfg else False,
            "params": ccfg.get("params") or {},
            "severity": ccfg.get("severity") or [],
        })
    return out


# --- grouping of large issue populations ----------------------------------------

_ISSUE_LABELS = {
    "disconnected_component": "cut off from the main network",
    "node_id_mismatch": "touching the main network under a different node number",
    "oneway_dead_end": "reachable on one-way links but with no way out",
    "orphan_node": "not connected to any road link",
    "zero_capacity": "coded with zero capacity",
    "zero_speed": "coded with zero or near-zero speed",
    "row_col_imbalance": "productions and attractions far apart",
    "intrazonal_share": "a high share of trips staying inside the zone",
    "connector_on_high_class": "loaded straight onto a freeway or expressway",
    "connector_too_long": "a centroid connector above the length limit",
    "over_capacity": "volume above capacity",
    "statistical_outlier": "volume far from similar links",
    "volume_too_low": "almost no traffic compared with similar links",
    "headway_out_of_range": "a headway outside the plausible range",
}
_ISSUE_NOUNS = {"disconnected_component": "separate network fragments",
                "node_id_mismatch": "network fragments"}
_NOUNS = {"link": "links", "node": "nodes", "zone": "zones", "line": "lines",
          "sector": "sector pairs", "run": "items", "matrix": "matrices"}


def _grouping_params() -> tuple[int, int]:
    d = config.checks().get("defaults") or {}
    return int(d.get("group_issue_above", 25)), int(d.get("group_keep_worst", 10))


def _group_large_issues(
    store: RunStore, check: Check, findings: list[Finding]
) -> tuple[list[Finding], str | None]:
    """Summarise an issue type that occurs more than ``group_issue_above`` times.

    The ``group_keep_worst`` most severe occurrences stay as individual findings
    (so the map and the action list still point at real locations) and the rest
    are folded into one summary finding that carries the count, the severity
    mix and example ids. Real networks produce thousands of identical coding
    problems; listing each one buries everything else.
    """
    above, keep = _grouping_params()
    groups: dict[str, list[Finding]] = {}
    for f in findings:
        issue = str(f.evidence.values.get("issue") or "")
        if issue:
            groups.setdefault(issue, []).append(f)
    big = {k: v for k, v in groups.items() if len(v) > above}
    if not big:
        return findings, None
    out = [f for f in findings if str(f.evidence.values.get("issue") or "") not in big]
    summaries: list[Finding] = []
    notes = []
    for issue, grp in big.items():
        # Stable sort: equal-severity findings keep the check's own ranking
        # (largest fragment, worst ratio ...), so "most severe" means something.
        grp.sort(key=lambda f: f.severity.rank)
        kept, rest = grp[:keep], grp[keep:]
        out.extend(kept)
        worst = grp[0]
        loc_type = worst.location.type.value
        noun = _ISSUE_NOUNS.get(issue) or _NOUNS.get(loc_type, "items")
        label = _ISSUE_LABELS.get(issue, issue.replace("_", " "))
        by_sev: dict[str, int] = {}
        for f in grp:
            by_sev[f.severity.value] = by_sev.get(f.severity.value, 0) + 1
        by_class: dict[str, int] = {}
        for f in grp:
            c = f.evidence.values.get("link_class")
            if c:
                by_class[str(c)] = by_class.get(str(c), 0) + 1
        sources = []
        for f in grp[:5]:
            sources.extend(f.evidence.sources[:1])
        summaries.append(make_finding(
            run_id=store.run_id, check=check, severity=Severity(worst.severity.value),
            location=Location(type=LocationType.RUN, id=store.run_id,
                              label=f"{len(grp):,} {noun}"),
            executive_line=(f"{len(grp):,} {noun} show the same problem: {label}. The "
                            f"{len(kept)} most severe are listed individually."),
            likely_cause=worst.likely_cause,
            suggested_action=("Fix the coding rule that produces this pattern rather than "
                              "each occurrence; " + worst.suggested_action[0].lower()
                              + worst.suggested_action[1:]),
            values={"issue": issue, "n_occurrences": len(grp), "n_listed": len(kept),
                    "by_severity": by_sev, **({"by_link_class": by_class} if by_class else {}),
                    "location_type": loc_type,
                    **({"nodes_in_fragments": sum(int(f.evidence.values.get("component_size", 0))
                                                  for f in grp)}
                       if issue in ("disconnected_component", "node_id_mismatch") else {}),
                    "example_ids": [f.location.id for f in grp[:50]],
                    "summarised_ids": [f.location.id for f in rest[:500]]},
            thresholds={"group_issue_above": above, "group_keep_worst": keep},
            sources=sources, query=worst.evidence.query,
            discriminator=f"group_{issue}",
            method=f"{len(grp):,} findings of issue '{issue}' grouped; the {len(kept)} most "
                   "severe kept as individual findings",
        ))
        notes.append(f"{issue}: {len(grp):,} occurrences grouped into one summary "
                     f"plus the {len(kept)} most severe")
    # Summaries lead; the sort is stable so each check's own ranking survives.
    out = summaries + out
    out.sort(key=lambda f: f.severity.rank)
    return out, "; ".join(notes)
