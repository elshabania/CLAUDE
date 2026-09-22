"""Inventory tool for a STEAM run directory (data_contract.md Section 3).

``inspect_dir`` walks any directory, classifies every file by extension,
records size and SHA-256, and for tabular files (CSV, DBF) records row count,
columns, dtypes, null rate, numeric min/max and distinct counts of candidate id
columns. SQLite files get their table list and row counts through the standard
library. Cube binaries (.net, .mat, .cat, .app), OMX, shapefiles and XLSX are
never parsed: only size and hash are recorded, so nothing is guessed.

``render_markdown`` turns the report into the tables of data_contract.md
Sections 4-6 so the output can be pasted into the contract.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

FORMAT_FAMILIES: dict[str, str] = {
    ".s": "cube_script",
    ".cat": "cube_catalog",
    ".app": "cube_application",
    ".net": "cube_network",
    ".mat": "cube_matrix",
    ".omx": "omx_matrix",
    ".lin": "transit_lines",
    ".dbf": "dbf",
    ".csv": "csv",
    ".prn": "print_file",
    ".sqlite": "sqlite",
    ".db": "sqlite",
    ".shp": "shapefile",
    ".shx": "shapefile_index",
    ".prj": "shapefile_projection",
    ".gdb": "geodatabase",
    ".xlsx": "xlsx",
    ".xls": "xlsx",
    ".json": "json",
    ".txt": "text",
    ".log": "text",
    ".parquet": "parquet",
}
TABULAR_FAMILIES = {"csv", "dbf"}
ID_TOKEN = re.compile(r"(^|_)(id|node|zone|taz|a|b|origin|destination|line|seq|link)($|_)", re.I)
MAX_DISTINCT_COLUMNS = 20


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def classify(path: Path) -> str:
    return FORMAT_FAMILIES.get(path.suffix.lower(), "other")


def is_id_column(name: str) -> bool:
    return bool(ID_TOKEN.search(str(name)))


def _read_tabular(path: Path, family: str, max_rows: int | None) -> pd.DataFrame:
    if family == "csv":
        return pd.read_csv(path, nrows=max_rows, low_memory=False)
    from dbfread import DBF

    dbf = DBF(str(path), load=False, ignore_missing_memofile=True)
    records = []
    for i, rec in enumerate(dbf):
        if max_rows is not None and i >= max_rows:
            break
        records.append(rec)
    return pd.DataFrame.from_records(records) if records else pd.DataFrame(columns=dbf.field_names)


def describe_frame(df: pd.DataFrame) -> dict[str, Any]:
    """Row count plus per-column dtype, null rate, numeric min/max and id distinct counts."""
    n = int(len(df))
    columns: list[dict[str, Any]] = []
    for col in df.columns:
        s = df[col]
        info: dict[str, Any] = {
            "name": str(col),
            "dtype": str(s.dtype),
            "null_rate": float(s.isna().mean()) if n else 0.0,
        }
        if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
            vals = pd.to_numeric(s, errors="coerce").dropna()
            if len(vals):
                info["min"] = float(vals.min())
                info["max"] = float(vals.max())
        if is_id_column(str(col)):
            info["distinct"] = int(s.nunique(dropna=True))
        columns.append(info)
    return {"rows": n, "columns": columns}


def _sqlite_tables(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        names = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        for name in names:
            quoted = name.replace('"', '""')
            rows = con.execute(f'SELECT COUNT(*) FROM "{quoted}"').fetchone()[0]
            cols = [r[1] for r in con.execute(f'PRAGMA table_info("{quoted}")')]
            out.append({"table": name, "rows": int(rows), "columns": cols})
    finally:
        con.close()
    return out


def inspect_file(path: Path, root: Path, *, max_rows: int | None = None) -> dict[str, Any]:
    family = classify(path)
    entry: dict[str, Any] = {
        "path": str(path.relative_to(root)).replace("\\", "/"),
        "ext": path.suffix.lower(),
        "family": family,
        "size": path.stat().st_size,
        "sha256": sha256_file(path),
    }
    try:
        if family in TABULAR_FAMILIES:
            entry["tabular"] = describe_frame(_read_tabular(path, family, max_rows))
            if max_rows is not None:
                entry["tabular"]["rows_sampled"] = True
        elif family == "sqlite":
            entry["sqlite"] = _sqlite_tables(path)
    except Exception as exc:  # record, never crash the inventory
        entry["error"] = f"{type(exc).__name__}: {exc}"
    return entry


def inspect_dir(path: Path, *, max_rows: int | None = None) -> dict[str, Any]:
    """Inventory every file under ``path``. ``max_rows`` caps rows read from tabular files."""
    root = Path(path).resolve()
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    files = [
        inspect_file(p, root, max_rows=max_rows) for p in sorted(root.rglob("*")) if p.is_file()
    ]
    by_family: dict[str, int] = {}
    for f in files:
        by_family[f["family"]] = by_family.get(f["family"], 0) + 1
    return {
        "root": str(root),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_files": len(files),
        "total_bytes": int(sum(f["size"] for f in files)),
        "by_family": dict(sorted(by_family.items())),
        "files": files,
    }


def _fmt(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if np.isnan(v):
            return ""
        return f"{v:.6g}"
    return str(v)


def render_markdown(report: dict[str, Any]) -> str:
    """Markdown in the layout of data_contract.md Sections 4-6."""
    out: list[str] = []
    out.append(f"## 4. Run directory layout: `{report['root']}`")
    out.append("")
    out.append(
        f"Inventory of {report['n_files']} files, {report['total_bytes']:,} bytes, "
        f"generated {report['generated_at']}."
    )
    out.append("")
    out.append("| Path | Format family | Size (bytes) | SHA-256 | Status |")
    out.append("|---|---|---|---|---|")
    for f in report["files"]:
        status = "Confirmed" if "tabular" in f or "sqlite" in f else "Recorded (not parsed)"
        if "error" in f:
            status = f"Error: {f['error']}"
        out.append(
            f"| `{f['path']}` | {f['family']} | {f['size']:,} | `{f['sha256'][:12]}` | {status} |"
        )
    out.append("")
    out.append("Files by family: " + ", ".join(f"{k} {v}" for k, v in report["by_family"].items()))
    out.append("")

    out.append("## 5-6. Tabular files (inputs and outputs)")
    out.append("")
    tabular = [f for f in report["files"] if "tabular" in f]
    if not tabular:
        out.append("No CSV or DBF files found.")
        out.append("")
    for f in tabular:
        t = f["tabular"]
        sampled = " (sampled)" if t.get("rows_sampled") else ""
        out.append(f"### `{f['path']}`: {t['rows']:,} rows{sampled}, {len(t['columns'])} columns")
        out.append("")
        out.append("| Field | Status | dtype | Null rate | Min | Max | Distinct (id) |")
        out.append("|---|---|---|---|---|---|---|")
        for c in t["columns"]:
            out.append(
                f"| {c['name']} | Confirmed | {c['dtype']} | {c['null_rate']:.3f} | "
                f"{_fmt(c.get('min'))} | {_fmt(c.get('max'))} | {_fmt(c.get('distinct'))} |"
            )
        out.append("")
    sqlite_files = [f for f in report["files"] if "sqlite" in f]
    for f in sqlite_files:
        out.append(f"### `{f['path']}` (SQLite)")
        out.append("")
        out.append("| Table | Rows | Columns |")
        out.append("|---|---|---|")
        for t in f["sqlite"]:
            out.append(f"| {t['table']} | {t['rows']:,} | {', '.join(t['columns'])} |")
        out.append("")
    binaries = [
        f for f in report["files"] if f["family"].startswith("cube_") or f["family"] == "omx_matrix"
    ]
    if binaries:
        out.append("### Cube binary and OMX files (not parsed in Slice 1)")
        out.append("")
        out.append("| Path | Family | Size (bytes) | Status |")
        out.append("|---|---|---|---|")
        for f in binaries:
            out.append(f"| `{f['path']}` | {f['family']} | {f['size']:,} | TBC via export script |")
        out.append("")
    return "\n".join(out)
