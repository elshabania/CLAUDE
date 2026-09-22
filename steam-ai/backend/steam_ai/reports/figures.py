"""Matplotlib figures for the diagnostic report (Agg backend, PNG output).

Each function returns ``(png_path, source_ref)`` or ``None`` when the data it
needs is absent. Figures are written into ``store.derived_path("figures")``.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from shapely import wkt as shapely_wkt  # noqa: E402

from .. import config  # noqa: E402
from ..models import Severity  # noqa: E402
from ..store import RunStore  # noqa: E402

SEVERITY_COLOURS = {
    "Critical": "#d03b3b",
    "High": "#ec835a",
    "Medium": "#fab219",
    "Info": "#9e9e9e",
}
SEVERITY_ORDER = ["Critical", "High", "Medium", "Info"]
INK = "#333333"
MUTED = "#6b6b6b"
GRID = "#e3e3e3"
DPI = 160
VC_MAX = 1.3


def _style(ax: plt.Axes) -> None:
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK, labelsize=8)
    ax.xaxis.label.set_color(INK)
    ax.yaxis.label.set_color(INK)
    ax.title.set_color(INK)
    ax.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)


def _fig_dir(store: RunStore) -> Path:
    d = store.derived_path("figures")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _save(fig: plt.Figure, path: Path) -> Path:
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path


def findings_by_severity_and_check(store: RunStore) -> tuple[Path, str] | None:
    """Horizontal stacked bar: findings per check, segmented by severity."""
    findings = store.findings()
    if not findings:
        return None
    df = pd.DataFrame(
        {
            "check": [f.check_name for f in findings],
            "severity": [f.severity.value for f in findings],
        }
    )
    pivot = df.pivot_table(
        index="check", columns="severity", values="severity", aggfunc="count", fill_value=0
    )
    for s in SEVERITY_ORDER:
        if s not in pivot.columns:
            pivot[s] = 0
    pivot = pivot[SEVERITY_ORDER]
    pivot["total"] = pivot.sum(axis=1)
    pivot = pivot.sort_values("total").drop(columns="total")

    fig, ax = plt.subplots(figsize=(7.5, max(2.4, 0.45 * len(pivot) + 1.2)))
    left = np.zeros(len(pivot))
    y = np.arange(len(pivot))
    for s in SEVERITY_ORDER:
        vals = pivot[s].to_numpy(dtype=float)
        ax.barh(
            y,
            vals,
            left=left,
            color=SEVERITY_COLOURS[s],
            label=s,
            height=0.6,
            edgecolor="white",
            linewidth=1.0,
        )
        left += vals
    for yi, total in zip(y, left, strict=False):
        ax.text(total + 0.1, yi, f"{int(total)}", va="center", fontsize=8, color=INK)
    ax.set_yticks(y)
    ax.set_yticklabels(pivot.index, fontsize=8)
    ax.set_xlabel("Findings")
    ax.set_title("Findings by check and severity", fontsize=10, loc="left")
    ax.xaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True))
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    _style(ax)
    ax.grid(True, axis="x", color=GRID, linewidth=0.6)
    ax.grid(False, axis="y")
    path = _save(fig, _fig_dir(store) / "findings_by_check.png")
    return path, f"[src: findings.json; {len(findings)} findings]"


def _flows_all(store: RunStore, periods: list[str]) -> pd.DataFrame | None:
    if not store.has("link_flows"):
        return None
    placeholders = ", ".join("?" for _ in periods)
    df = store.query(
        "SELECT link_id, period, vc_ratio FROM link_flows "
        f"WHERE user_class = 'ALL' AND vc_ratio IS NOT NULL AND period IN ({placeholders})",
        list(periods),
    )
    return df if len(df) else None


def vc_histogram(
    store: RunStore, periods: tuple[str, str] = ("AM", "PM")
) -> tuple[Path, str] | None:
    """V/C distribution for the peak periods, user class ALL, one panel per period."""
    df = _flows_all(store, list(periods))
    if df is None:
        return None
    present = [p for p in periods if (df.period == p).any()]
    if not present:
        return None
    bins = np.arange(0.0, 1.6 + 1e-9, 0.1)
    fig, axes = plt.subplots(1, len(present), figsize=(3.8 * len(present), 3.0), sharey=True)
    axes_list = list(np.atleast_1d(axes))
    for ax, p in zip(axes_list, present, strict=False):
        vals = np.clip(df.loc[df.period == p, "vc_ratio"].to_numpy(dtype=float), 0, 1.6 - 1e-6)
        ax.hist(vals, bins=bins, color="#3b6ea8", edgecolor="white", linewidth=0.8)
        ax.axvline(1.0, color=SEVERITY_COLOURS["Critical"], linewidth=1.2, linestyle="--")
        ax.set_title(f"{p} ({len(vals)} links)", fontsize=9, loc="left")
        ax.set_xlabel("V/C ratio")
        _style(ax)
        ax.grid(False, axis="x")
    axes_list[0].set_ylabel("Links")
    fig.suptitle("Link V/C distribution, user class ALL", fontsize=10, x=0.01, ha="left", y=1.04)
    path = _save(fig, _fig_dir(store) / "vc_histogram.png")
    return path, f"[src: link_flows table; user_class ALL; periods {', '.join(present)}]"


def _finding_points(store: RunStore, links: pd.DataFrame) -> pd.DataFrame:
    rows = []
    geoms = None
    for f in store.findings():
        if f.severity not in (Severity.CRITICAL, Severity.HIGH):
            continue
        lon, lat = f.location.lon, f.location.lat
        if (lon is None or lat is None) and f.location.type.value == "link":
            if geoms is None:
                geoms = {
                    int(r.link_id): r.geometry_wkt
                    for r in links.itertuples()
                    if isinstance(r.geometry_wkt, str)
                }
            w = geoms.get(int(f.location.id)) if f.location.id.isdigit() else None
            if w:
                c = shapely_wkt.loads(w).centroid
                lon, lat = c.x, c.y
        if lon is None or lat is None:
            continue
        rows.append({"lon": lon, "lat": lat, "severity": f.severity.value})
    return pd.DataFrame(rows, columns=["lon", "lat", "severity"])


def network_map(store: RunStore, period: str = "AM") -> tuple[Path, str] | None:
    """Links coloured by V/C (viridis), Critical and High finding locations marked."""
    if not store.has("links"):
        return None
    links = store.table("links")
    links = links[links.geometry_wkt.notna()]
    if links.empty:
        return None
    vc = None
    if store.has("link_flows"):
        vc = store.query(
            "SELECT link_id, vc_ratio FROM link_flows WHERE user_class = 'ALL' AND period = ?",
            [period],
        ).set_index("link_id")["vc_ratio"]

    segments = []
    colours = []
    for r in links.itertuples():
        try:
            geom = shapely_wkt.loads(r.geometry_wkt)
        except Exception:  # malformed WKT: skip the link, do not fail the report
            continue
        lines = [geom] if geom.geom_type == "LineString" else list(getattr(geom, "geoms", []))
        v = float(vc.get(r.link_id, np.nan)) if vc is not None else np.nan
        for ln in lines:
            if ln.geom_type != "LineString":
                continue
            segments.append(np.asarray(ln.coords)[:, :2])
            colours.append(v)
    if not segments:
        return None

    fig, ax = plt.subplots(figsize=(7.5, 6.5))
    vals = np.asarray(colours, dtype=float)
    has_vc = ~np.isnan(vals)
    if has_vc.any():
        cmap = plt.get_cmap("viridis")
        norm = matplotlib.colors.Normalize(vmin=0.0, vmax=VC_MAX)
        lc = LineCollection(
            [s for s, ok in zip(segments, has_vc, strict=False) if ok],
            cmap=cmap,
            norm=norm,
            linewidths=2.2,
        )
        lc.set_array(vals[has_vc])
        ax.add_collection(lc)
        cb = fig.colorbar(lc, ax=ax, fraction=0.035, pad=0.02, extend="max")
        cb.set_label(f"V/C ratio, {period}, user class ALL", fontsize=8, color=INK)
        cb.ax.tick_params(labelsize=7, colors=INK)
    if (~has_vc).any():
        ax.add_collection(
            LineCollection(
                [s for s, ok in zip(segments, has_vc, strict=False) if not ok],
                colors="#c8c8c8",
                linewidths=1.0,
                label="No flow data",
            )
        )

    pts = _finding_points(store, links)
    markers = {"Critical": ("X", 110), "High": ("^", 80)}
    for sev, (mk, size) in markers.items():
        sub = pts[pts.severity == sev]
        if sub.empty:
            continue
        ax.scatter(
            sub.lon,
            sub.lat,
            marker=mk,
            s=size,
            color=SEVERITY_COLOURS[sev],
            edgecolor="white",
            linewidth=0.8,
            zorder=5,
            label=f"{sev} finding",
        )

    all_xy = np.vstack(segments)
    lon_min, lat_min = all_xy.min(axis=0)
    lon_max, lat_max = all_xy.max(axis=0)
    pad_x = max((lon_max - lon_min) * 0.05, 1e-4)
    pad_y = max((lat_max - lat_min) * 0.05, 1e-4)
    ax.set_xlim(lon_min - pad_x, lon_max + pad_x)
    ax.set_ylim(lat_min - pad_y, lat_max + pad_y)
    mid_lat = 0.5 * (lat_min + lat_max)
    ax.set_aspect(1.0 / max(math.cos(math.radians(mid_lat)), 1e-6))
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.set_title(
        f"Network V/C, {period} peak, with Critical and High finding locations",
        fontsize=10,
        loc="left",
    )
    ax.annotate(
        "N",
        xy=(0.97, 0.96),
        xytext=(0.97, 0.88),
        xycoords="axes fraction",
        textcoords="axes fraction",
        ha="center",
        fontsize=9,
        color=INK,
        arrowprops={"arrowstyle": "-|>", "color": INK},
    )
    if ax.get_legend_handles_labels()[0]:
        ax.legend(
            frameon=False, fontsize=8, loc="upper center", bbox_to_anchor=(0.5, -0.08), ncol=3
        )
    _style(ax)
    path = _save(fig, _fig_dir(store) / "network_map.png")
    return path, (
        f"[src: links table (geometry_wkt); link_flows table period {period} "
        f"user_class ALL; findings.json]"
    )


def convergence_curves(store: RunStore) -> tuple[Path, str] | None:
    """REL_GAP against iteration per period, log y, with the configured target."""
    if not store.has("convergence"):
        return None
    df = store.query(
        "SELECT stage, period, iteration, value FROM convergence "
        "WHERE metric = 'REL_GAP' AND value IS NOT NULL ORDER BY stage, period, iteration"
    )
    df = df[df.value > 0]
    if df.empty:
        return None
    params = config.checks().get("checks", {}).get("convergence_and_noise", {}).get("params", {})
    target = params.get("rel_gap_target")
    palette = ["#3b6ea8", "#c9702a", "#5c9a5c", "#8a5fb5", "#b5b52a", "#4a9ab0"]
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    for i, ((stage, period), g) in enumerate(df.groupby(["stage", "period"], sort=True)):
        label = f"{period}" if df.stage.nunique() == 1 else f"{stage} {period}"
        ax.plot(
            g.iteration,
            g.value,
            linewidth=2.0,
            color=palette[i % len(palette)],
            label=label,
            marker="o",
            markersize=3,
        )
        ax.annotate(
            label,
            xy=(g.iteration.iloc[-1], g.value.iloc[-1]),
            xytext=(4, 0),
            textcoords="offset points",
            fontsize=8,
            va="center",
            color=INK,
        )
    if target is not None:
        ax.axhline(
            float(target), color=MUTED, linestyle="--", linewidth=1.0, label=f"Target {target}"
        )
    ax.set_yscale("log")
    ax.set_xlabel("Iteration")
    ax.set_ylabel("Relative gap")
    ax.set_title("Assignment convergence by period", fontsize=10, loc="left")
    ax.legend(frameon=False, fontsize=8, loc="upper right")
    _style(ax)
    path = _save(fig, _fig_dir(store) / "convergence.png")
    return path, "[src: convergence table (metric REL_GAP); config/checks.yaml rel_gap_target]"


def build_all(
    store: RunStore, reporting_cfg: Mapping[str, Any] | None = None
) -> dict[str, tuple[Path, str]]:
    """Build every figure that the data allows; keys are stable for the report model."""
    rcfg = reporting_cfg if reporting_cfg is not None else config.reporting()
    diag = rcfg.get("diagnostic_report", {})
    out: dict[str, tuple[Path, str]] = {}
    if diag.get("include_charts", True):
        for key, fn in (
            ("findings_by_check", findings_by_severity_and_check),
            ("vc_hist", vc_histogram),
            ("convergence", convergence_curves),
        ):
            res = fn(store)
            if res is not None:
                out[key] = res
    if diag.get("include_map", True):
        res = network_map(store)
        if res is not None:
            out["network_map"] = res
    return out
