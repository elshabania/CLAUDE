"""Input and result differences between a run and its base.

All comparisons are done in DuckDB by reading the base run's Parquet tables into
the scenario run's connection (``read_parquet``), so nothing is copied through
pandas except the small result frames. Every function returns plain,
JSON-serialisable Python.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from .checks.base import base_table_sql
from .store import RunStore

_EXAMPLES = 50


def _clean(v: Any) -> Any:
    if hasattr(v, "item"):
        try:
            v = v.item()
        except (ValueError, TypeError):
            return str(v)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    return v


def _records(df: pd.DataFrame, limit: int | None = None) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    if limit is not None:
        df = df.head(limit)
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _both_have(store: RunStore, base: RunStore, *tables: str) -> bool:
    return all(store.has(t) and base.has(t) for t in tables)


# --- land use -------------------------------------------------------------------


def land_use_sector_deltas(store: RunStore, base: RunStore) -> pd.DataFrame:
    """Per sector x variable: run total, base total, delta and delta share of base."""
    if not _both_have(store, base, "land_use", "zones"):
        return pd.DataFrame(columns=["sector_id", "variable", "run", "base", "delta",
                                     "delta_share"])
    sql = f"""
        WITH r AS (
            SELECT COALESCE(z.sector_id, 'UNKNOWN') AS sector_id, l.variable,
                   SUM(l.value) AS run
            FROM land_use l LEFT JOIN zones z USING (zone_id) GROUP BY 1, 2
        ),
        b AS (
            SELECT COALESCE(z.sector_id, 'UNKNOWN') AS sector_id, l.variable,
                   SUM(l.value) AS base
            FROM {base_table_sql(base, "land_use")} l
            LEFT JOIN {base_table_sql(base, "zones")} z USING (zone_id) GROUP BY 1, 2
        )
        SELECT sector_id, variable, COALESCE(run, 0) AS run, COALESCE(base, 0) AS base,
               COALESCE(run, 0) - COALESCE(base, 0) AS delta,
               (COALESCE(run, 0) - COALESCE(base, 0)) / NULLIF(base, 0) AS delta_share
        FROM r FULL OUTER JOIN b USING (sector_id, variable)
        ORDER BY sector_id, variable
    """
    return store.query(sql)


# --- links ----------------------------------------------------------------------


def link_changes(store: RunStore, base: RunStore) -> dict[str, Any]:
    """Links added, removed or with changed capacity, lanes or free-flow speed."""
    if not _both_have(store, base, "links"):
        return {"available": False}
    sql = f"""
        SELECT COALESCE(r.link_id, b.link_id) AS link_id,
               COALESCE(r.sector_id, b.sector_id) AS sector_id,
               CASE WHEN b.link_id IS NULL THEN 'added'
                    WHEN r.link_id IS NULL THEN 'removed' ELSE 'changed' END AS change,
               r.capacity_vph IS DISTINCT FROM b.capacity_vph AS capacity_changed,
               r.lanes IS DISTINCT FROM b.lanes AS lanes_changed,
               r.ffs_kph IS DISTINCT FROM b.ffs_kph AS ffs_changed,
               r.capacity_vph, b.capacity_vph AS base_capacity_vph,
               r.lanes, b.lanes AS base_lanes, r.ffs_kph, b.ffs_kph AS base_ffs_kph,
               COALESCE(r.link_class, b.link_class) AS link_class
        FROM links r FULL OUTER JOIN {base_table_sql(base, "links")} b USING (link_id)
        WHERE r.link_id IS NULL OR b.link_id IS NULL
           OR r.capacity_vph IS DISTINCT FROM b.capacity_vph
           OR r.lanes IS DISTINCT FROM b.lanes
           OR r.ffs_kph IS DISTINCT FROM b.ffs_kph
        ORDER BY change, link_id
    """
    df = store.query(sql)
    if df.empty:
        return {"available": True, "n_added": 0, "n_removed": 0, "n_changed": 0,
                "n_capacity_changed": 0, "n_lanes_changed": 0, "n_ffs_changed": 0,
                "by_sector": [], "examples": []}
    changed = df[df["change"] == "changed"]
    by_sector = (
        df.assign(sector_id=df["sector_id"].fillna("UNKNOWN"))
        .groupby(["sector_id", "change"]).size().reset_index(name="n")
    )
    return {
        "available": True,
        "n_added": int((df["change"] == "added").sum()),
        "n_removed": int((df["change"] == "removed").sum()),
        "n_changed": int(len(changed)),
        "n_capacity_changed": int(changed["capacity_changed"].fillna(False).sum()),
        "n_lanes_changed": int(changed["lanes_changed"].fillna(False).sum()),
        "n_ffs_changed": int(changed["ffs_changed"].fillna(False).sum()),
        "by_sector": _records(by_sector),
        "examples": _records(df, _EXAMPLES),
    }


# --- transit --------------------------------------------------------------------


def transit_changes(store: RunStore, base: RunStore) -> dict[str, Any]:
    """Lines added or removed, and headway changes per line x period."""
    if not _both_have(store, base, "transit_lines"):
        return {"available": False}
    sql = f"""
        SELECT COALESCE(r.line_id, b.line_id) AS line_id,
               COALESCE(r.period, b.period) AS period,
               COALESCE(r.mode, b.mode) AS mode,
               CASE WHEN b.line_id IS NULL THEN 'added'
                    WHEN r.line_id IS NULL THEN 'removed' ELSE 'headway_changed' END AS change,
               r.headway_min, b.headway_min AS base_headway_min
        FROM transit_lines r
        FULL OUTER JOIN {base_table_sql(base, "transit_lines")} b
          ON b.line_id = r.line_id AND COALESCE(b.period, '') = COALESCE(r.period, '')
        WHERE r.line_id IS NULL OR b.line_id IS NULL
           OR r.headway_min IS DISTINCT FROM b.headway_min
        ORDER BY change, line_id, period
    """
    df = store.query(sql)
    lines_added = sorted(set(df.loc[df["change"] == "added", "line_id"]))
    lines_removed = sorted(set(df.loc[df["change"] == "removed", "line_id"]))
    return {
        "available": True,
        "lines_added": lines_added,
        "lines_removed": lines_removed,
        "n_headway_changes": int((df["change"] == "headway_changed").sum()),
        "headway_changes": _records(df[df["change"] == "headway_changed"], _EXAMPLES),
        "line_sectors": line_sectors(store, list(df["line_id"].unique())),
    }


def line_sectors(store: RunStore, line_ids: list[str] | None = None) -> dict[str, list[str]]:
    """Map each transit line to the sectors of the links it runs on (via its nodes)."""
    if not store.has("transit_segments") or not store.has("links"):
        return {}
    where = ""
    if line_ids is not None:
        if not line_ids:
            return {}
        quoted = ", ".join("'" + str(x).replace("'", "''") + "'" for x in line_ids)
        where = f"WHERE s.line_id IN ({quoted})"
    sql = f"""
        WITH ends AS (
            SELECT link_id, sector_id, a_node AS node_id FROM links
            UNION SELECT link_id, sector_id, b_node FROM links
        )
        SELECT DISTINCT s.line_id, e.sector_id
        FROM transit_segments s JOIN ends e ON e.node_id = s.from_node
        {where}
        ORDER BY 1, 2
    """
    df = store.query(sql)
    out: dict[str, list[str]] = {}
    for r in df.itertuples():
        if r.sector_id is not None:
            out.setdefault(str(r.line_id), []).append(str(r.sector_id))
    return out


# --- parameters ------------------------------------------------------------------


def parameter_changes(store: RunStore, base: RunStore) -> list[dict[str, Any]]:
    """Parameters whose value differs between run and base (added/removed included)."""
    if not _both_have(store, base, "parameters"):
        return []
    sql = f"""
        SELECT COALESCE(r.key, b.key) AS key, r.value AS run_value, b.value AS base_value,
               CASE WHEN b.key IS NULL THEN 'added' WHEN r.key IS NULL THEN 'removed'
                    ELSE 'changed' END AS change
        FROM parameters r FULL OUTER JOIN {base_table_sql(base, "parameters")} b USING (key)
        WHERE r.key IS NULL OR b.key IS NULL
           OR TRIM(COALESCE(r.value, '')) <> TRIM(COALESCE(b.value, ''))
        ORDER BY key
    """
    return _records(store.query(sql))


# --- sector-level explanation summary ------------------------------------------


def sector_change_summary(
    store: RunStore, base: RunStore, land_use_share: float = 0.01
) -> dict[str, list[str]]:
    """For each sector, a list of plain-text input changes that could explain a demand shift.

    Includes land-use variables that moved by more than ``land_use_share`` of base,
    links added/removed/changed (capacity, lanes, speed) and transit lines
    added/removed/re-timed that touch the sector.
    """
    out: dict[str, list[str]] = {}
    lu = land_use_sector_deltas(store, base)
    for r in lu.itertuples():
        share = None if r.delta_share is None or pd.isna(r.delta_share) else float(r.delta_share)
        if (share is not None and abs(share) > land_use_share) or (
            share is None and float(r.delta) != 0
        ):
            pct = f"{share * 100:+.1f}%" if share is not None else "new"
            out.setdefault(str(r.sector_id), []).append(
                f"{r.variable} {pct} ({float(r.base):,.0f} -> {float(r.run):,.0f})"
            )
    links = link_changes(store, base)
    for row in links.get("by_sector", []):
        out.setdefault(str(row["sector_id"]), []).append(
            f"{int(row['n'])} link(s) {row['change']}"
        )
    transit = transit_changes(store, base)
    if transit.get("available"):
        sectors = transit.get("line_sectors", {})
        for line in transit.get("lines_added", []):
            for s in sectors.get(line, []):
                out.setdefault(s, []).append(f"transit line {line} added")
        for line in transit.get("lines_removed", []):
            for s in sectors.get(line, []):
                out.setdefault(s, []).append(f"transit line {line} removed")
        for h in transit.get("headway_changes", []):
            for s in sectors.get(str(h["line_id"]), []):
                out.setdefault(s, []).append(
                    f"line {h['line_id']} headway {h['base_headway_min']} -> "
                    f"{h['headway_min']} ({h['period']})"
                )
    return out


# --- findings and KPIs -----------------------------------------------------------


def findings_delta(store: RunStore, base: RunStore) -> dict[str, Any]:
    """New, resolved and unchanged findings by finding_id (which excludes run_id)."""
    run_f = {f.finding_id: f for f in store.findings()}
    base_f = {f.finding_id: f for f in base.findings()}
    new_ids = sorted(set(run_f) - set(base_f))
    resolved_ids = sorted(set(base_f) - set(run_f))
    unchanged_ids = sorted(set(run_f) & set(base_f))

    def brief(f: Any) -> dict[str, Any]:
        return {"finding_id": f.finding_id, "check_id": f.check_id,
                "severity": f.severity.value, "location_type": f.location.type.value,
                "location_id": f.location.id, "executive_line": f.executive_line}

    return {
        "n_new": len(new_ids), "n_resolved": len(resolved_ids), "n_unchanged": len(unchanged_ids),
        "new": [brief(run_f[i]) for i in new_ids],
        "resolved": [brief(base_f[i]) for i in resolved_ids],
        "unchanged": [brief(run_f[i]) for i in unchanged_ids],
    }


def kpi_deltas(store: RunStore, base: RunStore) -> list[dict[str, Any]]:
    """KPI values run vs base with absolute and relative deltas, when both exist."""
    run_k = {k.kpi_id: k for k in store.kpis()}
    base_k = {k.kpi_id: k for k in base.kpis()}
    out = []
    for kid, k in run_k.items():
        b = base_k.get(kid)
        if b is None:
            continue
        delta = float(k.value) - float(b.value)
        out.append({
            "kpi_id": kid, "name": k.name, "unit": k.unit, "run": float(k.value),
            "base": float(b.value), "delta": delta,
            "delta_share": (delta / abs(float(b.value))) if float(b.value) else None,
        })
    return out


def compute(store: RunStore, base: RunStore) -> dict[str, Any]:
    """Summarise input differences and result deltas between ``store`` and ``base``."""
    lu = land_use_sector_deltas(store, base)
    lu_changed = lu[lu["delta"].fillna(0) != 0] if not lu.empty else lu
    totals = (
        lu.groupby("variable")[["run", "base", "delta"]].sum().reset_index()
        if not lu.empty else pd.DataFrame(columns=["variable", "run", "base", "delta"])
    )
    if not totals.empty:
        totals["delta_share"] = totals["delta"] / totals["base"].replace(0, float("nan"))
    return {
        "run_id": store.run_id,
        "base_run_id": base.run_id,
        "land_use": {
            "available": not lu.empty or _both_have(store, base, "land_use", "zones"),
            "totals": _records(totals),
            "by_sector": _records(lu_changed),
            "n_sector_variables_changed": int(len(lu_changed)),
        },
        "links": link_changes(store, base),
        "transit": transit_changes(store, base),
        "parameters": parameter_changes(store, base),
        "findings": findings_delta(store, base),
        "kpis": kpi_deltas(store, base),
    }
