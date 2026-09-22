"""Synthetic transit lines and line loads.

Lines run along whole grid rows or columns (METRO and BRT on the central FWY
radials, BUS on ART rows/columns). Each line is written once, in one direction,
and its loads are the sum of PT trips travelling in either direction between
its stops (a simplification documented here so checks are not surprised).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .demand import Demand
from .network import Network, haversine_m

# mode -> (headway by period in minutes, vehicle capacity, stop every N nodes)
MODE_PARAMS: dict[str, tuple[dict[str, float], float, int]] = {
    "METRO": ({"AM": 4.0, "MD": 8.0, "PM": 4.0, "EV": 10.0, "NT": 15.0}, 800.0, 2),
    "BRT": ({"AM": 6.0, "MD": 10.0, "PM": 6.0, "EV": 12.0, "NT": 20.0}, 150.0, 2),
    "BUS": ({"AM": 10.0, "MD": 15.0, "PM": 10.0, "EV": 20.0, "NT": 30.0}, 80.0, 1),
}
OPERATORS = {"METRO": "ADMETRO", "BRT": "ITC-BRT", "BUS": "ITC-BUS"}
CATCHMENT_M = 1500.0  # a zone is served by a line if a stop is within this distance


@dataclass
class Line:
    line_id: str
    mode: str
    nodes: list[int]
    headways: dict[str, float] = field(default_factory=dict)
    vehicle_capacity: float = 80.0
    stop_every: int = 1
    force_unused: bool = False

    def stops(self) -> list[bool]:
        n = len(self.nodes)
        return [(i % self.stop_every == 0) or i == n - 1 for i in range(n)]


def make_line(line_id: str, mode: str, nodes: list[int]) -> Line:
    headways, cap, stop_every = MODE_PARAMS[mode]
    return Line(line_id, mode, nodes, dict(headways), cap, stop_every)


def default_lines(net: Network, *, extra_bus: bool = False, unused_bus: bool = False) -> list[Line]:
    """One METRO, one BRT and BUS lines on the inner ART rows/columns."""
    g = net.grid_ids
    lines = [
        make_line("METRO_1", "METRO", [int(n) for n in g[:, net.fwy_col]]),
        make_line("BRT_1", "BRT", [int(n) for n in g[net.fwy_row, :]]),
    ]
    art_rows = [r for r in net.art_rows() if 0 < r < net.grid - 1]
    art_cols = [c for c in net.art_cols() if 0 < c < net.grid - 1]
    k = 1
    for r in art_rows:
        lines.append(make_line(f"BUS_{k}", "BUS", [int(n) for n in g[r, :]]))
        k += 1
    for c in art_cols:
        lines.append(make_line(f"BUS_{k}", "BUS", [int(n) for n in g[:, c]]))
        k += 1
    if extra_bus:
        edge_rows = [r for r in net.art_rows() if r in (0, net.grid - 1)]
        r = edge_rows[-1] if edge_rows else net.grid - 1
        lines.append(make_line("BUS_NEW", "BUS", [int(n) for n in g[r, :]]))
    if unused_bus:
        # Duplicates the busiest ART column through the centre; loads are forced to ~0.
        c = art_cols[len(art_cols) // 2] if art_cols else net.fwy_col
        ln = make_line("BUS_UNUSED", "BUS", [int(n) for n in g[:, c]])
        ln.force_unused = True
        lines.append(ln)
    return lines


def lines_tables(lines: list[Line], periods: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """transit_lines (one row per line x period) and transit_segments."""
    line_rows, seg_rows = [], []
    for ln in lines:
        for period in periods:
            line_rows.append(
                {
                    "line_id": ln.line_id,
                    "mode": ln.mode,
                    "operator": OPERATORS.get(ln.mode, "ITC"),
                    "period": period,
                    "headway_min": float(ln.headways[period]),
                    "fare_ref": f"FARE_{ln.mode}",
                    "vehicle_capacity": float(ln.vehicle_capacity),
                }
            )
        stops = ln.stops()
        for seq in range(len(ln.nodes) - 1):
            seg_rows.append(
                {
                    "line_id": ln.line_id,
                    "seq": seq + 1,
                    "from_node": ln.nodes[seq],
                    "to_node": ln.nodes[seq + 1],
                    "is_stop": bool(stops[seq]),
                }
            )
    return pd.DataFrame(line_rows), pd.DataFrame(seg_rows)


def line_loads(
    lines: list[Line],
    net: Network,
    demand: Demand,
    periods: list[str],
    period_hours: dict[str, float],
) -> pd.DataFrame:
    """Assign PT trips to the single best line per zone pair and accumulate segment loads."""
    xy = net.node_xy()
    cx = net.zones.centroid_x.to_numpy()
    cy = net.zones.centroid_y.to_numpy()
    nz = len(cx)
    n_lines = len(lines)

    # For each line: nearest stop index per zone, access distance, cumulative distance per node.
    stop_idx = np.full((n_lines, nz), -1, dtype=np.int64)
    access = np.full((n_lines, nz), np.inf)
    cum = []
    for li, ln in enumerate(lines):
        pts = np.array([xy[n] for n in ln.nodes])
        seg_len = np.asarray(haversine_m(pts[:-1, 0], pts[:-1, 1], pts[1:, 0], pts[1:, 1]))
        cum.append(np.concatenate([[0.0], np.cumsum(seg_len)]))
        stop_mask = np.array(ln.stops())
        d = np.asarray(haversine_m(cx[:, None], cy[:, None], pts[None, :, 0], pts[None, :, 1]))
        d[:, ~stop_mask] = np.inf
        best = d.argmin(axis=1)
        dmin = d[np.arange(nz), best]
        served = dmin <= CATCHMENT_M
        stop_idx[li, served] = best[served]
        access[li, served] = dmin[served]

    # Generalised cost per line per zone pair: access + egress + in-vehicle distance.
    cost = np.full((n_lines, nz, nz), np.inf)
    for li in range(n_lines):
        s = stop_idx[li]
        ok = (s[:, None] >= 0) & (s[None, :] >= 0) & (s[:, None] != s[None, :])
        inveh = np.abs(cum[li][np.maximum(s[:, None], 0)] - cum[li][np.maximum(s[None, :], 0)])
        c = access[li][:, None] * 2.0 + access[li][None, :] * 2.0 + inveh
        cost[li] = np.where(ok, c, np.inf)
    best_line = cost.argmin(axis=0)
    any_line = np.isfinite(cost.min(axis=0))

    rows = []
    for period in periods:
        pt = demand.total("PT", period)
        for li, ln in enumerate(lines):
            n_seg = len(ln.nodes) - 1
            load = np.zeros(n_seg)
            board = np.zeros(n_seg + 1)
            alight = np.zeros(n_seg + 1)
            if not ln.force_unused:
                pairs = np.where(any_line & (best_line == li) & (pt > 0))
                s_o = stop_idx[li][pairs[0]]
                s_d = stop_idx[li][pairs[1]]
                t = pt[pairs]
                lo, hi = np.minimum(s_o, s_d), np.maximum(s_o, s_d)
                diff = np.zeros(n_seg + 1)
                np.add.at(diff, lo, t)
                np.add.at(diff, hi, -t)
                load = np.cumsum(diff)[:n_seg]
                np.add.at(board, s_o, t)
                np.add.at(alight, s_d, t)
            vehicles = max(period_hours[period] * 60.0 / ln.headways[period], 1.0)
            crowd = load / (ln.vehicle_capacity * vehicles)
            for seq in range(n_seg):
                rows.append(
                    {
                        "line_id": ln.line_id,
                        "seq": seq + 1,
                        "period": period,
                        "load": round(float(load[seq]), 2),
                        "boardings": round(float(board[seq]), 2),
                        "alightings": round(float(alight[seq + 1]), 2),
                        "crowding_factor": round(float(crowd[seq]), 4),
                    }
                )
    return pd.DataFrame(rows)
