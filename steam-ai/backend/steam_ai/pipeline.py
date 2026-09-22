"""End-to-end processing of one exported run: ingest -> checks -> solutions ->
noise band -> health -> KPIs -> report. This is what the watcher and the CLI
call; nothing here is interactive."""

from __future__ import annotations

import time
from pathlib import Path

from . import audit
from .store import RunStore


def process_export_dir(
    path: Path,
    *,
    base_run_id: str | None = None,
    run_id: str | None = None,
    make_report: bool = True,
) -> str:
    from .ingest import ingest_export_dir

    t0 = time.time()
    manifest = ingest_export_dir(Path(path), base_run_id=base_run_id, run_id=run_id)
    rid = manifest.run_id
    run_checks(rid, make_report=make_report)
    audit.record("run_processed", run_id=rid, seconds=round(time.time() - t0, 2))
    return rid


def run_checks(run_id: str, *, make_report: bool = True, only: list[str] | None = None) -> None:
    from . import health, kpis, noise, solutions
    from .checks.registry import run_all

    store = RunStore(run_id)
    base = store.base_store()
    try:
        results = run_all(store, base, only=only)
        findings = [f for r in results for f in r.findings]
        findings = solutions.propose(store, findings)
        findings = noise.apply_noise_band(findings, store)
        findings.sort(key=lambda f: (f.severity.rank, f.check_id))
        store.write_findings(findings)
        store.write_check_results(results)
        store.write_health(health.compute(store, results))
        store.write_kpis(kpis.compute(store))
        store.update_manifest(status="checked")
        if make_report:
            from .reports.diagnostic import build

            build(store)
            store.update_manifest(status="reported")
    finally:
        store.close()
        if base is not None:
            base.close()
