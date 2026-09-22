"""Shared machinery for diagnostic checks.

A check is a small class with a ``run`` method that reads only internal tables
through :class:`steam_ai.store.RunStore` and returns :class:`Finding` objects.
Thresholds and severity mapping live in ``config/checks.yaml``; the check
computes a handful of named variables per candidate and asks
:func:`evaluate_severity` which band (if any) they fall in.

Every finding built here carries evidence with the SQL that produced the
numbers and ``SourceRef`` entries pointing at the source file and row, so a
modeller can trace each number back to the STEAM export.
"""

from __future__ import annotations

import ast
import hashlib
import math
import re
from functools import lru_cache
from collections.abc import Iterable, Sequence
from typing import Any

import pandas as pd

from ..models import Evidence, Finding, Location, LocationType, Severity, SourceRef
from ..store import RunStore


class SkipCheck(Exception):
    """Raised by a check when it cannot run meaningfully on this run.

    The registry converts it into a ``CheckResult`` with status SKIPPED and the
    exception message; it is not an error.
    """


class Check:
    """Base class for all checks. Subclasses set the class attributes and ``run``."""

    check_id: str = ""
    name: str = ""
    description: str = ""
    required_tables: set[str] = set()
    needs_base: bool = False

    def __init__(self) -> None:
        # Set during run(); read by the registry after run() returns.
        self.rows_examined: int = 0
        self.message: str | None = None

    def base_optional_with(self, params: dict[str, Any]) -> bool:
        """True when a ``needs_base`` check can still run without a base (e.g. via a
        reference table in its params). Default: no."""
        return False

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        raise NotImplementedError


# --- Severity expression evaluator --------------------------------------------

_BOOL_OPS = {ast.And: all, ast.Or: any}
_ALLOWED_CALLS: dict[str, Any] = {"abs": abs, "min": min, "max": max, "round": round}


@lru_cache(maxsize=512)
def _compile(expr: str) -> ast.Expression:
    tree = ast.parse(expr.strip(), mode="eval")
    _validate(tree)
    return tree


def _validate(node: ast.AST) -> None:
    """Reject anything outside the whitelist before evaluation."""
    allowed = (
        ast.Expression,
        ast.BoolOp,
        ast.And,
        ast.Or,
        ast.UnaryOp,
        ast.Not,
        ast.USub,
        ast.UAdd,
        ast.Compare,
        ast.Eq,
        ast.NotEq,
        ast.Lt,
        ast.LtE,
        ast.Gt,
        ast.GtE,
        ast.Name,
        ast.Load,
        ast.Constant,
        ast.BinOp,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Call,
    )
    for child in ast.walk(node):
        if not isinstance(child, allowed):
            raise ValueError(f"unsupported syntax in severity rule: {type(child).__name__}")
        if isinstance(child, ast.Call):
            if not isinstance(child.func, ast.Name) or child.func.id not in _ALLOWED_CALLS:
                raise ValueError("only abs/min/max/round calls are allowed in severity rules")
            if child.keywords:
                raise ValueError("keyword arguments are not allowed in severity rules")
        if isinstance(child, ast.Constant) and not isinstance(
            child.value, (int, float, str, bool, type(None))
        ):
            raise ValueError("only numeric, string and boolean constants are allowed")


def _compare(op: ast.cmpop, left: Any, right: Any) -> bool:
    if isinstance(op, ast.Eq):
        return left == right
    if isinstance(op, ast.NotEq):
        return left != right
    if left is None or right is None:
        return False
    if isinstance(left, float) and math.isnan(left):
        return False
    if isinstance(right, float) and math.isnan(right):
        return False
    if isinstance(op, ast.Lt):
        return left < right
    if isinstance(op, ast.LtE):
        return left <= right
    if isinstance(op, ast.Gt):
        return left > right
    if isinstance(op, ast.GtE):
        return left >= right
    raise ValueError("unsupported comparison")


def _eval(node: ast.AST, env: dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _eval(node.body, env)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return env.get(node.id)
    if isinstance(node, ast.BoolOp):
        fn = _BOOL_OPS[type(node.op)]
        return fn(bool(_eval(v, env)) for v in node.values)
    if isinstance(node, ast.UnaryOp):
        val = _eval(node.operand, env)
        if isinstance(node.op, ast.Not):
            return not val
        if val is None:
            return None
        return -val if isinstance(node.op, ast.USub) else +val
    if isinstance(node, ast.Compare):
        left = _eval(node.left, env)
        for op, comp in zip(node.ops, node.comparators, strict=True):
            right = _eval(comp, env)
            if not _compare(op, left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.BinOp):
        a, b = _eval(node.left, env), _eval(node.right, env)
        if a is None or b is None:
            return None
        if isinstance(node.op, ast.Add):
            return a + b
        if isinstance(node.op, ast.Sub):
            return a - b
        if isinstance(node.op, ast.Mult):
            return a * b
        if isinstance(node.op, ast.Div):
            return None if b == 0 else a / b
    if isinstance(node, ast.Call):
        fn = _ALLOWED_CALLS[node.func.id]  # type: ignore[attr-defined]
        args = [_eval(a, env) for a in node.args]
        if any(a is None for a in args):
            return None
        return fn(*args)
    raise ValueError(f"unsupported node {type(node).__name__}")


def evaluate_expression(expr: str, **variables: Any) -> Any:
    """Safely evaluate one ``when`` expression against the given variables.

    Supports comparisons (chained), and/or/not, unary minus, + - * /, abs/min/max/round,
    string equality and bare variable truthiness. Unknown variables evaluate to
    None, and ordered comparisons against None are False.
    """
    return _eval(_compile(expr), variables)


def evaluate_severity(rules: Sequence[dict[str, Any]], **variables: Any) -> Severity | None:
    """Return the severity of the first rule whose ``when`` expression is true.

    ``rules`` is the list from ``config/checks.yaml`` (``{when, severity}``).
    Returns None when no rule matches, meaning "not a finding".
    """
    for rule in rules:
        if bool(evaluate_expression(str(rule["when"]), **variables)):
            return Severity(rule["severity"])
    return None


# --- Formatting helpers ---------------------------------------------------------


def fmt(value: Any, digits: int = 0) -> str:
    """Round a number for prose: thousands separators, no trailing noise."""
    if value is None:
        return "n/a"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    if math.isnan(v):
        return "n/a"
    if digits <= 0:
        return f"{int(round(v)):,}"
    return f"{v:,.{digits}f}"


def pct(share: Any, digits: int = 0) -> str:
    """Format a share (0..1) as a percentage string."""
    if share is None:
        return "n/a"
    try:
        v = float(share) * 100.0
    except (TypeError, ValueError):
        return str(share)
    if math.isnan(v):
        return "n/a"
    return f"{v:.{digits}f}%"


def period_label(period: str | None) -> str:
    """Plain-language label for a period code, e.g. 'the AM peak'."""
    if not period:
        return "all periods"
    labels = {
        "AM": "the AM peak",
        "MD": "the midday period",
        "PM": "the PM peak",
        "EV": "the evening",
        "NT": "the night period",
    }
    return labels.get(period, f"period {period}")


def _json_safe(value: Any) -> Any:
    """Convert numpy/pandas scalars and containers to plain JSON-safe Python."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "item") and callable(value.item):
        try:
            value = value.item()
        except (ValueError, TypeError):
            return str(value)
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)


def modeller_view(
    values: dict[str, Any],
    thresholds: dict[str, Any],
    query: str | None,
    sources: Iterable[SourceRef],
    method: str | None = None,
) -> str:
    """Compose the modeller view: values, thresholds, method, SQL and files."""
    lines: list[str] = []
    if method:
        lines.append(f"Method: {method}")
    if values:
        vals = ", ".join(f"{k}={_short(v)}" for k, v in values.items() if not isinstance(v, list))
        if vals:
            lines.append(f"Values: {vals}")
    if thresholds:
        lines.append("Thresholds: " + ", ".join(f"{k}={_short(v)}" for k, v in thresholds.items()))
    files: dict[str, list[int]] = {}
    for s in sources:
        files.setdefault(s.file, [])
        if s.row is not None:
            files[s.file].append(int(s.row))
    if files:
        parts = []
        for f, rows in files.items():
            if rows:
                shown = ", ".join(str(r) for r in rows[:10])
                more = f" (+{len(rows) - 10} more)" if len(rows) > 10 else ""
                parts.append(f"{f} rows {shown}{more}")
            else:
                parts.append(f)
        lines.append("Files: " + "; ".join(parts))
    if query:
        lines.append("SQL: " + " ".join(query.split()))
    return "\n".join(lines)


def _short(v: Any) -> str:
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


# --- Findings -------------------------------------------------------------------


def finding_id(
    check_id: str,
    location_type: str,
    location_id: str,
    period: str | None,
    discriminator: str | None = None,
) -> str:
    """Deterministic id, stable across runs so findings can be diffed run-to-run.

    Deliberately excludes run_id (see changes.compute); run_id is a separate field.
    """
    key = "|".join([check_id, location_type, str(location_id), period or "", discriminator or ""])
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def make_finding(
    *,
    run_id: str,
    check: Check,
    severity: Severity,
    location: Location,
    executive_line: str,
    likely_cause: str,
    suggested_action: str,
    values: dict[str, Any],
    thresholds: dict[str, Any],
    sources: list[SourceRef],
    query: str | None,
    period: str | None = None,
    method: str | None = None,
    discriminator: str | None = None,
    modeller_text: str | None = None,
) -> Finding:
    """Build a Finding with deterministic id and fully populated evidence."""
    values = _json_safe(values)
    thresholds = _json_safe(thresholds)
    evidence = Evidence(
        values=values, thresholds=thresholds, sources=sources, period=period, query=query
    )
    return Finding(
        finding_id=finding_id(
            check.check_id, location.type.value, location.id, period, discriminator
        ),
        run_id=run_id,
        check_id=check.check_id,
        check_name=check.name,
        severity=severity,
        location=location,
        executive_line=executive_line,
        modeller_view=modeller_text
        or modeller_view(values, thresholds, query, sources, method=method),
        evidence=evidence,
        likely_cause=likely_cause,
        suggested_action=suggested_action,
    )


# --- Source references ----------------------------------------------------------


def _row_or_none(v: Any) -> int | None:
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def refs_from_rows(
    df: pd.DataFrame,
    table: str,
    column: str | None = None,
    limit: int = 20,
    file_col: str = "source_file",
    row_col: str = "source_row",
) -> list[SourceRef]:
    """SourceRefs from the source_file/source_row columns of a result frame."""
    out: list[SourceRef] = []
    if df is None or df.empty:
        return out
    has_file = file_col in df.columns
    has_row = row_col in df.columns
    for _, r in df.head(limit).iterrows():
        file = str(r[file_col]) if has_file and r[file_col] is not None else f"{table}.csv"
        if has_file and isinstance(r[file_col], float) and math.isnan(r[file_col]):
            file = f"{table}.csv"
        out.append(
            SourceRef(
                file=file,
                row=_row_or_none(r[row_col]) if has_row else None,
                table=table,
                column=column,
            )
        )
    return out


def table_ref(store: RunStore, table: str, column: str | None = None) -> SourceRef:
    """A SourceRef for a whole table, using the manifest's source file when known."""
    file = f"{table}.csv"
    try:
        for entry in store.manifest().files:
            if entry.get("table") == table and entry.get("path"):
                file = str(entry["path"])
                break
    except Exception:  # manifest problems must never break a check
        pass
    return SourceRef(file=file, row=None, table=table, column=column)


# --- Locations ------------------------------------------------------------------

_NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def midpoint_from_wkt(wkt: str | None) -> tuple[float, float] | None:
    """Midpoint (lon, lat) along a WKT LINESTRING/POINT/POLYGON, or None."""
    if not wkt or not isinstance(wkt, str):
        return None
    nums = [float(x) for x in _NUM.findall(wkt.split("(", 1)[-1])]
    if len(nums) < 2:
        return None
    pts = list(zip(nums[0::2], nums[1::2], strict=False))
    if len(pts) == 1:
        return pts[0]
    seg = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:], strict=False)]
    total = sum(seg)
    if total == 0:
        return pts[0]
    half = total / 2.0
    acc = 0.0
    for (a, b), d in zip(zip(pts, pts[1:], strict=False), seg, strict=True):
        if acc + d >= half:
            t = (half - acc) / d if d else 0.0
            return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        acc += d
    return pts[-1]


def _id_list(ids: Iterable[Any]) -> str:
    return ",".join(str(int(i)) for i in ids)


def link_locations(store: RunStore, link_ids: Iterable[Any]) -> dict[int, Location]:
    """Locations for links, with lon/lat at the geometry midpoint and a label."""
    ids = sorted({int(i) for i in link_ids})
    if not ids:
        return {}
    df = store.query(
        "SELECT link_id, a_node, b_node, link_class, area_type, geometry_wkt FROM links "
        f"WHERE link_id IN ({_id_list(ids)})"
    )
    out: dict[int, Location] = {}
    for _, r in df.iterrows():
        mid = midpoint_from_wkt(r["geometry_wkt"])
        cls = r["link_class"] or "?"
        out[int(r["link_id"])] = Location(
            type=LocationType.LINK,
            id=str(int(r["link_id"])),
            label=f"Link {int(r['link_id'])} ({cls}, {int(r['a_node'])}-{int(r['b_node'])})",
            lon=mid[0] if mid else None,
            lat=mid[1] if mid else None,
        )
    for i in ids:
        out.setdefault(i, Location(type=LocationType.LINK, id=str(i), label=f"Link {i}"))
    return out


def node_locations(store: RunStore, node_ids: Iterable[Any]) -> dict[int, Location]:
    """Locations for nodes with lon/lat from the nodes table."""
    ids = sorted({int(i) for i in node_ids})
    if not ids:
        return {}
    df = store.query(
        f"SELECT node_id, x, y, is_centroid FROM nodes WHERE node_id IN ({_id_list(ids)})"
    )
    out: dict[int, Location] = {}
    for _, r in df.iterrows():
        kind = "Centroid" if bool(r["is_centroid"]) else "Node"
        out[int(r["node_id"])] = Location(
            type=LocationType.NODE,
            id=str(int(r["node_id"])),
            label=f"{kind} {int(r['node_id'])}",
            lon=_float_or_none(r["x"]),
            lat=_float_or_none(r["y"]),
        )
    for i in ids:
        out.setdefault(i, Location(type=LocationType.NODE, id=str(i), label=f"Node {i}"))
    return out


def zone_locations(store: RunStore, zone_ids: Iterable[Any]) -> dict[int, Location]:
    """Locations for zones with lon/lat at the zone centroid."""
    ids = sorted({int(i) for i in zone_ids})
    if not ids:
        return {}
    df = store.query(
        "SELECT zone_id, centroid_x, centroid_y, sector_id, geometry_wkt FROM zones "
        f"WHERE zone_id IN ({_id_list(ids)})"
    )
    out: dict[int, Location] = {}
    for _, r in df.iterrows():
        lon, lat = _float_or_none(r["centroid_x"]), _float_or_none(r["centroid_y"])
        if lon is None or lat is None:
            mid = midpoint_from_wkt(r["geometry_wkt"])
            if mid:
                lon, lat = mid
        sec = f", sector {r['sector_id']}" if r["sector_id"] else ""
        out[int(r["zone_id"])] = Location(
            type=LocationType.ZONE,
            id=str(int(r["zone_id"])),
            label=f"Zone {int(r['zone_id'])}{sec}",
            lon=lon,
            lat=lat,
        )
    for i in ids:
        out.setdefault(i, Location(type=LocationType.ZONE, id=str(i), label=f"Zone {i}"))
    return out


def run_location(store: RunStore, label: str | None = None) -> Location:
    """A run-level location (whole model)."""
    return Location(type=LocationType.RUN, id=store.run_id, label=label or "Whole model")


def _float_or_none(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def base_table_sql(base: RunStore, table: str) -> str:
    """SQL fragment reading a base run's table inside the scenario's DuckDB connection.

    Lets comparison checks join run and base tables in one query without copying
    frames through pandas: ``FROM links l JOIN {base_table_sql(base, 'links')} b ...``.
    """
    path = str(base.table_path(table)).replace("'", "''")
    return f"read_parquet('{path}')"


def sql_str_list(values: Iterable[Any]) -> str:
    """Render a list of strings as a quoted SQL IN-list."""
    items = [str(v).replace("'", "''") for v in values]
    return ", ".join(f"'{v}'" for v in items) or "''"
