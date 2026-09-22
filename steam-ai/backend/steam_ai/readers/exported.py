"""Reader for the modeller-run export directory (CSV, DBF per table plus sentinel).

The export script writes one file per internal table, named per
``schema.EXPORT_TABLE_FILES`` (``<table>.csv``); a ``<table>.dbf`` with the
same columns is accepted when the CSV is absent. Column names are matched
case-insensitively, values are coerced to the schema dtypes here, and the
schema itself (``schema.py``) stays the single authority on columns.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa

from .. import schema
from ..models import RunManifest

_TRUE = {"true", "t", "1", "y", "yes"}
_FALSE = {"false", "f", "0", "n", "no", ""}


class ExportError(ValueError):
    """The export directory is malformed (missing sentinel, bad file, bad columns)."""


def read_sentinel(path: Path) -> dict:
    sentinel = Path(path) / schema.EXPORT_SENTINEL
    if not sentinel.exists():
        raise ExportError(f"no {schema.EXPORT_SENTINEL} in {path}; export not complete")
    try:
        data = json.loads(sentinel.read_text("utf-8"))
    except json.JSONDecodeError as exc:
        raise ExportError(f"{sentinel} is not valid JSON: {exc}") from exc
    for key in ("scenario_name", "horizon_year"):
        if key not in data:
            raise ExportError(f"{sentinel} lacks required key {key!r}")
    return data


def _coerce_bool(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series.astype(object)
    out: list[bool | None] = []
    for v in series.tolist():
        if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NA:
            out.append(None)
        elif isinstance(v, (bool, np.bool_)):
            out.append(bool(v))
        elif isinstance(v, (int, float, np.integer, np.floating)):
            out.append(bool(v))
        else:
            s = str(v).strip().lower()
            if s in _TRUE:
                out.append(True)
            elif s in _FALSE:
                out.append(None if s == "" else False)
            else:
                raise ExportError(f"cannot read {v!r} as a boolean")
    return pd.Series(out, index=series.index, dtype=object)


def _coerce_string(series: pd.Series) -> pd.Series:
    vals = series.astype(object).where(series.notna(), None)
    return vals.map(lambda v: None if v is None else str(v)).astype(object)


def coerce_frame(df: pd.DataFrame, name: str) -> pd.DataFrame:
    """Rename columns case-insensitively and coerce dtypes to ``schema.TABLES[name]``.

    Missing columns are added as null; extra columns are dropped.
    """
    sch = schema.TABLES[name]
    lower = {c.lower(): c for c in df.columns}
    out = pd.DataFrame(index=df.index)
    for field in sch:
        src = lower.get(field.name.lower())
        col = df[src] if src is not None else pd.Series([None] * len(df), index=df.index)
        t = field.type
        try:
            if pa.types.is_boolean(t):
                out[field.name] = _coerce_bool(col)
            elif pa.types.is_integer(t):
                out[field.name] = pd.to_numeric(col, errors="raise").astype("Int64")
            elif pa.types.is_floating(t):
                out[field.name] = pd.to_numeric(col, errors="raise").astype("float64")
            else:
                out[field.name] = _coerce_string(col)
        except (ValueError, TypeError) as exc:
            raise ExportError(f"{name}.{field.name}: cannot coerce to {t}: {exc}") from exc
    return out.reset_index(drop=True)


def _read_dbf(path: Path) -> pd.DataFrame:
    from dbfread import DBF  # imported lazily; only needed for DBF exports

    records = list(DBF(str(path), load=True, ignore_missing_memofile=True))
    return pd.DataFrame.from_records(records) if records else pd.DataFrame()


class ExportedRunReader:
    """RunReader over an export directory. Optional tables return ``None`` when absent."""

    def __init__(self, path: Path, run_id: str | None = None):
        self.path = Path(path)
        self.run_id = run_id
        self.sentinel = read_sentinel(self.path)
        self._cache: dict[str, pd.DataFrame | None] = {}

    # --- file discovery ---------------------------------------------------------
    def table_file(self, name: str) -> Path | None:
        csv = self.path / schema.EXPORT_TABLE_FILES[name]
        if csv.exists():
            return csv
        dbf = csv.with_suffix(".dbf")
        if dbf.exists():
            return dbf
        return None

    def available_tables(self) -> list[str]:
        return [t for t in schema.TABLES if self.table_file(t) is not None]

    def missing_required(self) -> list[str]:
        return [
            t
            for t in schema.TABLES
            if t not in schema.OPTIONAL_TABLES and self.table_file(t) is None
        ]

    # --- tables -----------------------------------------------------------------
    def table(self, name: str) -> pd.DataFrame | None:
        if name not in schema.TABLES:
            raise KeyError(name)
        if name in self._cache:
            return self._cache[name]
        file = self.table_file(name)
        if file is None:
            df = None
        else:
            sch = schema.TABLES[name]
            if file.suffix.lower() == ".csv":
                str_cols = [f.name for f in sch if pa.types.is_string(f.type)]
                raw = pd.read_csv(file, dtype={c: "string" for c in str_cols}, low_memory=False)
            else:
                raw = _read_dbf(file)
            df = coerce_frame(raw, name)
            if "source_file" in df.columns:
                df["source_file"] = df["source_file"].where(df["source_file"].notna(), file.name)
            if "source_row" in df.columns:
                rows = pd.Series(np.arange(1, len(df) + 1), dtype="Int64")
                df["source_row"] = df["source_row"].where(df["source_row"].notna(), rows)
        self._cache[name] = df
        return df

    def _required(self, name: str) -> pd.DataFrame:
        df = self.table(name)
        if df is None:
            raise ExportError(f"required table {name} missing from {self.path}")
        return df

    def manifest(self) -> RunManifest:
        s = self.sentinel
        return RunManifest(
            run_id=self.run_id or f"{s['scenario_name']}_{s['horizon_year']}",
            scenario_name=str(s["scenario_name"]),
            horizon_year=int(s["horizon_year"]),
            policy_set=str(s.get("policy_set", "REF")),
            ingested_at=datetime.now(timezone.utc),
            source_root=str(self.path),
            steam_version=str(s.get("steam_version", "unknown")),
            is_synthetic=bool(s.get("is_synthetic", False)),
            files=list(s.get("files", [])),
            tables={k: int(v) for k, v in s.get("tables", {}).items()},
        )

    def links(self) -> pd.DataFrame:
        return self._required("links")

    def nodes(self) -> pd.DataFrame:
        return self._required("nodes")

    def zones(self) -> pd.DataFrame:
        return self._required("zones")

    def land_use(self) -> pd.DataFrame:
        return self._required("land_use")

    def lines(self) -> tuple[pd.DataFrame, pd.DataFrame | None]:
        return self._required("transit_lines"), self.table("transit_segments")

    def link_flows(self) -> pd.DataFrame:
        return self._required("link_flows")

    def line_loads(self) -> pd.DataFrame | None:
        return self.table("line_loads")

    def matrices(self, kind: str = "DEMAND") -> pd.DataFrame:
        od = self._required("od")
        return od.loc[od.matrix_kind == kind].reset_index(drop=True)

    def skims(self, kind: str = "TIME") -> pd.DataFrame | None:
        sk = self.table("skims")
        if sk is None:
            return None
        return sk.loc[sk.skim_kind == kind].reset_index(drop=True)

    def convergence(self) -> pd.DataFrame:
        return self._required("convergence")

    def parameters(self) -> pd.DataFrame | None:
        return self.table("parameters")
