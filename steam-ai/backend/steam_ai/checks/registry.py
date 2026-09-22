"""Registry of checks and the runner used by the pipeline and the API.

``run_all`` never raises: a check that cannot run is reported as SKIPPED, one
that crashes as ERROR, and the remaining checks still run.
"""

from __future__ import annotations

import time
import traceback
from typing import Any

from .. import audit, config
from ..models import CheckResult, CheckStatus, Finding
from ..store import RunStore
from .base import Check, SkipCheck
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
    findings, cap_msg = _cap(list(findings), max_findings)
    messages = [m for m in (check.message, cap_msg) if m]
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
