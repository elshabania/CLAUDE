"""Run KPIs from ``config/kpis.yaml``: one DuckDB query each over the internal tables.

A KPI whose tables are absent from the run is skipped (not an error); one whose
query fails or returns no number is skipped too and recorded in the audit log.
Each KPI cites the tables it read and carries its SQL in ``definition``.
"""

from __future__ import annotations

import math
import re
from typing import Any

from . import audit, config, schema
from .models import KPI, SourceRef
from .store import RunStore

_TABLE_RE = re.compile(r"\b(" + "|".join(sorted(schema.TABLES, key=len, reverse=True)) + r")\b")
_PERIOD_RE = re.compile(r"period\s*=\s*'([A-Za-z0-9_]+)'")


def tables_in(sql: str) -> list[str]:
    """Internal table names referenced by a query (word matches against schema.TABLES)."""
    return sorted(set(_TABLE_RE.findall(sql)))


def _source_file(store: RunStore, table: str) -> str:
    try:
        for entry in store.manifest().files:
            if entry.get("table") == table and entry.get("path"):
                return str(entry["path"])
    except Exception:  # noqa: BLE001
        pass
    return f"{table}.csv"


def _period_of(kpi: dict[str, Any]) -> str | None:
    m = _PERIOD_RE.search(str(kpi.get("sql", "")))
    if m:
        return m.group(1)
    return None


def compute(store: RunStore) -> list[KPI]:
    """Evaluate every configured KPI that the run's tables allow."""
    out: list[KPI] = []
    for kpi in config.kpis():
        sql = str(kpi["sql"]).strip()
        tables = tables_in(sql)
        missing = [t for t in tables if not store.has(t)]
        if missing:
            audit.record("kpi_skipped", run_id=store.run_id, kpi_id=kpi["id"],
                         reason="missing tables: " + ", ".join(missing))
            continue
        try:
            value = store.scalar(sql)
        except Exception as exc:  # noqa: BLE001 - one bad KPI must not stop the rest
            audit.record("kpi_error", run_id=store.run_id, kpi_id=kpi["id"],
                         error=f"{type(exc).__name__}: {exc}")
            continue
        if value is None:
            audit.record("kpi_skipped", run_id=store.run_id, kpi_id=kpi["id"],
                         reason="query returned no value")
            continue
        try:
            fval = float(value)
        except (TypeError, ValueError):
            audit.record("kpi_error", run_id=store.run_id, kpi_id=kpi["id"],
                         error=f"non-numeric value {value!r}")
            continue
        if math.isnan(fval) or math.isinf(fval):
            audit.record("kpi_skipped", run_id=store.run_id, kpi_id=kpi["id"],
                         reason="query returned NaN/inf")
            continue
        out.append(KPI(
            kpi_id=str(kpi["id"]),
            name=str(kpi["name"]),
            value=fval,
            unit=str(kpi["unit"]),
            period=_period_of(kpi),
            definition=f"{str(kpi['definition']).strip()} SQL: {' '.join(sql.split())}",
            sources=[SourceRef(file=_source_file(store, t), table=t) for t in tables],
        ))
    return out
