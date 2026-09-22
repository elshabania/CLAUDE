"""RunStore: the only way modules read or write a run's data.

Layout on disk (immutable after ingest, except the derived/ folder):

    data/runs/<run_id>/
        manifest.json
        tables/<table>.parquet        one per internal table (schema.py)
        derived/findings.json
        derived/check_results.json
        derived/health.json
        derived/kpis.json
        derived/noise_band.parquet
        derived/report.docx, report.pdf

Queries go through DuckDB with every present table registered as a view
named after the table, so checks write plain SQL such as
``SELECT ... FROM link_flows JOIN links USING (link_id)``.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from . import schema
from .models import KPI, CheckResult, Finding, HealthScore, RunManifest
from .paths import run_dir, runs_dir


class RunNotFound(FileNotFoundError):
    pass


class RunStore:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.path = run_dir(run_id)
        if not (self.path / "manifest.json").exists():
            raise RunNotFound(run_id)
        self.tables_dir = self.path / "tables"
        self.derived_dir = self.path / "derived"
        self.derived_dir.mkdir(parents=True, exist_ok=True)
        self._con: duckdb.DuckDBPyConnection | None = None

    # --- manifest -------------------------------------------------------------
    def manifest(self) -> RunManifest:
        return RunManifest.model_validate_json((self.path / "manifest.json").read_text("utf-8"))

    def update_manifest(self, **fields: Any) -> RunManifest:
        m = self.manifest().model_copy(update=fields)
        (self.path / "manifest.json").write_text(m.model_dump_json(indent=2), "utf-8")
        return m

    def base_store(self) -> RunStore | None:
        base = self.manifest().base_run_id
        if not base:
            return None
        try:
            return RunStore(base)
        except RunNotFound:
            return None

    # --- tables ---------------------------------------------------------------
    def table_path(self, name: str) -> Path:
        return self.tables_dir / f"{name}.parquet"

    def has(self, name: str) -> bool:
        return self.table_path(name).exists()

    def available_tables(self) -> list[str]:
        return [t for t in schema.TABLES if self.has(t)]

    def table(self, name: str) -> pd.DataFrame:
        if not self.has(name):
            raise KeyError(f"table {name} not present in run {self.run_id}")
        return pq.read_table(self.table_path(name)).to_pandas()

    def con(self) -> duckdb.DuckDBPyConnection:
        if self._con is None:
            self._con = duckdb.connect(database=":memory:")
            for t in self.available_tables():
                p = str(self.table_path(t)).replace("'", "''")
                self._con.execute(f"CREATE VIEW {t} AS SELECT * FROM read_parquet('{p}')")
            if (self.derived_dir / "noise_band.parquet").exists():
                p = str(self.derived_dir / "noise_band.parquet").replace("'", "''")
                self._con.execute(f"CREATE VIEW noise_band AS SELECT * FROM read_parquet('{p}')")
        return self._con

    def query(self, sql: str, params: list[Any] | None = None) -> pd.DataFrame:
        return self.con().execute(sql, params or []).df()

    def scalar(self, sql: str, params: list[Any] | None = None) -> Any:
        row = self.con().execute(sql, params or []).fetchone()
        return None if row is None else row[0]

    def row_count(self, name: str) -> int:
        if not self.has(name):
            return 0
        return pq.ParquetFile(self.table_path(name)).metadata.num_rows

    # --- derived artefacts ----------------------------------------------------
    def _write_json(self, name: str, payload: Any) -> None:
        (self.derived_dir / f"{name}.json").write_text(
            json.dumps(payload, indent=2, default=str), "utf-8"
        )

    def _read_json(self, name: str) -> Any:
        p = self.derived_dir / f"{name}.json"
        if not p.exists():
            return None
        return json.loads(p.read_text("utf-8"))

    def write_findings(self, findings: Iterable[Finding]) -> None:
        self._write_json("findings", [f.model_dump(mode="json") for f in findings])

    def findings(self) -> list[Finding]:
        raw = self._read_json("findings") or []
        return [Finding.model_validate(r) for r in raw]

    def write_check_results(self, results: Iterable[CheckResult]) -> None:
        slim = []
        for r in results:
            d = r.model_dump(mode="json")
            d["n_findings"] = len(r.findings)
            d.pop("findings", None)
            slim.append(d)
        self._write_json("check_results", slim)

    def check_results(self) -> list[dict[str, Any]]:
        return self._read_json("check_results") or []

    def write_health(self, health: HealthScore) -> None:
        self._write_json("health", health.model_dump(mode="json"))

    def health(self) -> HealthScore | None:
        raw = self._read_json("health")
        return HealthScore.model_validate(raw) if raw else None

    def write_kpis(self, kpis: Iterable[KPI]) -> None:
        self._write_json("kpis", [k.model_dump(mode="json") for k in kpis])

    def kpis(self) -> list[KPI]:
        return [KPI.model_validate(r) for r in (self._read_json("kpis") or [])]

    def write_noise_band(self, df: pd.DataFrame) -> None:
        pq.write_table(pa.Table.from_pandas(df, preserve_index=False),
                       self.derived_dir / "noise_band.parquet")
        self._con = None  # re-register views

    def noise_band(self) -> pd.DataFrame | None:
        p = self.derived_dir / "noise_band.parquet"
        return pq.read_table(p).to_pandas() if p.exists() else None

    def derived_path(self, name: str) -> Path:
        return self.derived_dir / name

    def close(self) -> None:
        if self._con is not None:
            self._con.close()
            self._con = None


def list_runs() -> list[RunManifest]:
    out: list[RunManifest] = []
    root = runs_dir()
    if not root.exists():
        return out
    for d in sorted(root.iterdir()):
        mp = d / "manifest.json"
        if mp.exists():
            out.append(RunManifest.model_validate_json(mp.read_text("utf-8")))
    out.sort(key=lambda m: m.ingested_at, reverse=True)
    return out


def write_table(run_id: str, name: str, df: pd.DataFrame) -> int:
    """Write a DataFrame as the named internal table, coerced to schema.py."""
    sch = schema.TABLES[name]
    for field in sch:
        if field.name not in df.columns:
            df[field.name] = None
    df = df[[f.name for f in sch]]
    table = pa.Table.from_pandas(df, schema=sch, preserve_index=False, safe=False)
    tdir = run_dir(run_id) / "tables"
    tdir.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, tdir / f"{name}.parquet")
    return table.num_rows
