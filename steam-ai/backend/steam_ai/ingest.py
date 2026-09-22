"""Ingest a completed export directory into an immutable run under the data root.

Steps: validate the sentinel and every listed file's SHA-256, derive the run id
from the content hash unless one is given, refuse to overwrite an existing run,
read every table through :class:`ExportedRunReader`, write Parquet tables via
``store.write_table``, write ``manifest.json`` and record an audit event. A
failure part-way removes the half-written run directory so runs on disk are
always complete.
"""

from __future__ import annotations

import hashlib
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from . import audit, schema
from .config import period_codes
from .models import RunManifest
from .paths import run_dir
from .readers.exported import ExportedRunReader, ExportError, read_sentinel
from .store import write_table


class IngestError(RuntimeError):
    """Raised when an export directory cannot be ingested; the message lists every problem."""


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_files(path: Path, sentinel: dict) -> tuple[list[dict], list[str]]:
    """Check every file listed in the sentinel. Returns (verified entries, problems)."""
    problems: list[str] = []
    verified: list[dict] = []
    listed = sentinel.get("files")
    if not isinstance(listed, list) or not listed:
        return [], [f"{schema.EXPORT_SENTINEL} lists no files"]
    listed_names = set()
    for entry in listed:
        rel = str(entry.get("path", ""))
        listed_names.add(rel)
        target = Path(path) / rel
        if not rel or not target.is_file():
            problems.append(f"missing file listed in sentinel: {rel!r}")
            continue
        actual = sha256_file(target)
        expected = str(entry.get("sha256", "")).lower()
        if actual != expected:
            problems.append(
                f"sha256 mismatch for {rel}: sentinel {expected[:12]} != file {actual[:12]}"
            )
            continue
        size = target.stat().st_size
        if "size" in entry and int(entry["size"]) != size:
            problems.append(f"size mismatch for {rel}: sentinel {entry['size']} != file {size}")
            continue
        verified.append({"path": rel, "size": size, "sha256": actual})
    for name, file_name in schema.EXPORT_TABLE_FILES.items():
        for candidate in (file_name, Path(file_name).with_suffix(".dbf").name):
            if (Path(path) / candidate).is_file() and candidate not in listed_names:
                problems.append(
                    f"table file {candidate} ({name}) present but not listed in sentinel"
                )
    return verified, problems


def _safe_id(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(text)).strip("_") or "run"


def derive_run_id(sentinel: dict, files: list[dict]) -> str:
    """``<scenario>_<year>_<sha[:8]>`` where sha hashes the sorted file hashes."""
    h = hashlib.sha256()
    for f in sorted(files, key=lambda e: e["path"]):
        h.update(f"{f['path']}:{f['sha256']}\n".encode())
    return (
        f"{_safe_id(sentinel['scenario_name'])}_{int(sentinel['horizon_year'])}_{h.hexdigest()[:8]}"
    )


def ingest_export_dir(
    path: Path,
    *,
    base_run_id: str | None = None,
    run_id: str | None = None,
) -> RunManifest:
    """Validate, read and store one export directory; returns the written manifest."""
    path = Path(path)
    if not path.is_dir():
        raise IngestError(f"{path} is not a directory")
    try:
        sentinel = read_sentinel(path)
    except ExportError as exc:
        raise IngestError(str(exc)) from exc

    files, problems = verify_files(path, sentinel)
    if problems:
        raise IngestError(f"export at {path} failed validation:\n  " + "\n  ".join(problems))

    run_id = _safe_id(run_id) if run_id else derive_run_id(sentinel, files)
    target = run_dir(run_id)
    if target.exists():
        raise IngestError(f"run {run_id} already exists at {target}; runs are immutable")

    try:
        reader = ExportedRunReader(path, run_id=run_id)
    except ExportError as exc:
        raise IngestError(str(exc)) from exc
    missing = reader.missing_required()
    if missing:
        raise IngestError(f"required tables missing from {path}: {missing}")

    table_of_file = {v: k for k, v in schema.EXPORT_TABLE_FILES.items()}
    for f in files:
        name = table_of_file.get(f["path"]) or table_of_file.get(
            Path(f["path"]).with_suffix(".csv").name
        )
        if name:
            f["table"] = name

    target.mkdir(parents=True, exist_ok=False)
    try:
        counts: dict[str, int] = {}
        for name in schema.TABLES:
            try:
                df = reader.table(name)
            except ExportError as exc:
                raise IngestError(str(exc)) from exc
            if df is None:
                continue
            expected = sentinel.get("tables", {}).get(name)
            if expected is not None and int(expected) != len(df):
                raise IngestError(f"{name}: sentinel says {expected} rows but file has {len(df)}")
            counts[name] = write_table(run_id, name, df)
        flows = reader.table("link_flows")
        seen = set(flows["period"].dropna().astype(str)) if flows is not None else set()
        known = [p for p in period_codes() if p in seen]
        periods = known + sorted(seen - set(known))
        manifest = RunManifest(
            run_id=run_id,
            scenario_name=str(sentinel["scenario_name"]),
            horizon_year=int(sentinel["horizon_year"]),
            policy_set=str(sentinel.get("policy_set", "REF")),
            base_run_id=base_run_id,
            ingested_at=datetime.now(timezone.utc),
            source_root=str(path.resolve()),
            steam_version=str(sentinel.get("steam_version", "unknown")),
            is_synthetic=bool(sentinel.get("is_synthetic", False)),
            status="ingested",
            files=files,
            tables=counts,
            periods=periods,
        )
        (target / "manifest.json").write_text(manifest.model_dump_json(indent=2), "utf-8")
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    audit.record(
        "run_ingested",
        run_id=run_id,
        source_root=str(path.resolve()),
        base_run_id=base_run_id,
        is_synthetic=manifest.is_synthetic,
        tables=counts,
        n_files=len(files),
    )
    return manifest
