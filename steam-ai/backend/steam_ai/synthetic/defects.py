"""Deterministic defects planted into the synthetic run.

Every defect is selected from the network skeleton (never from flows), so
:func:`manifest` can report exactly which ids were touched without running the
full generator. Defects fall into three groups by where they are applied:

* demand defects, applied to the dense matrices before the long-form OD table
  is written (``negative_matrix_cells``, ``row_col_imbalance``,
  ``high_intrazonal``, ``trip_length_shift``);
* generation switches (``poor_convergence`` in the convergence series,
  ``unused_transit_line`` as a forced-empty BUS line);
* table defects, applied to the finished tables (everything else).

See :data:`DEFECT_DOCS` for the table and rows each one touches.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .assign import bpr_time
from .demand import Demand, lengthen_trips
from .network import (
    CLASS_PARAMS,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    Network,
    haversine_m,
    linestring_wkt,
)
from .transit import Line

ORPHAN_NODE_IDS = [9001, 9002, 9003]
DEAD_END_NODE_ID = 9100
DEAD_END_LINK_ID = 90001
CONNECTOR_ON_FWY_LINK_IDS = [90002, 90003]
MISSING_NODE_REF_LINK_ID = 90004
MISSING_NODE_ID = 99998
LINE_MISSING_NODE_ID = 99999
BROKEN_LINE, BAD_HEADWAY_LINE, MISSING_NODE_LINE, UNUSED_LINE = (
    "BUS_1",
    "BUS_2",
    "BUS_3",
    "BUS_UNUSED",
)
DRIFTED_PARAMETERS = {"VOT_CAR": ("45.0", "38.5"), "PT_FARE_BASE": ("2.0", "2.5")}
NEGATIVE_MATRIX = ("DEMAND", "HBW", "CAR", "AM")
OVERCAPACITY_N_LINKS = 10
OVERCAPACITY_VC_START = 1.40
OVERCAPACITY_VC_STEP = 0.02

DEFECT_DOCS: dict[str, str] = {
    "orphan_nodes": "nodes: three extra nodes 9001-9003 with no links.",
    "zero_capacity_link": "links: capacity_vph = 0 on the first two ART links in SUB area type.",
    "zero_speed_link": "links: ffs_kph = 0 on the first two COL links.",
    "oneway_dead_end": (
        "nodes/links: node 9100 reached by one-way link 90001 (class LOC) with no outgoing link."
    ),
    "connector_on_fwy": (
        "links: CONN links 90002/90003 joining a centroid directly to a node on the E-W FWY."
    ),
    "broken_line_sequence": (
        "transit_segments: BUS_1 has segment seq 3 removed and renumbered, so seq 3 does not "
        "start where seq 2 ends; line_loads renumbered alike."
    ),
    "headway_out_of_range": "transit_lines: BUS_2 headway_min = 0.5 in AM and 240 in NT.",
    "line_node_not_in_network": "transit_segments: BUS_3 seq 2/3 pass through node 99999.",
    "land_use_total_mismatch": "control_totals: POP at region ALL = 1.12 x sum of zone POP.",
    "overcapacity_corridor": (
        "link_flows/iteration_flows: AM volumes on the first ten eastbound links of the E-W FWY "
        "scaled so vc_ratio = 1.40, 1.42, ... (speeds/times recomputed by BPR)."
    ),
    "low_volume_outlier": (
        "link_flows/iteration_flows: AM volume of the first ART/URB link set to 1% of the "
        "AM median of ART/URB links."
    ),
    "negative_matrix_cells": "od: DEMAND/HBW/CAR/AM cells from zone 1 to zones 2..6 made negative.",
    "row_col_imbalance": (
        "od: for zone n_zones//3 every CAR matrix row x4 and column x0.2 (productions >> "
        "attractions)."
    ),
    "high_intrazonal": "od: zone n_zones//2 intrazonal trips set to 40% of its row total, all matrices.",
    "poor_convergence": "convergence: HWY_ASSIGN AM REL_GAP series ends at 0.02 instead of 0.0005.",
    "speed_above_ffs": "link_flows: PM cong_speed_kph = 1.15 x ffs on the first three COL/URB links.",
    "speed_below_floor": "link_flows: AM cong_speed_kph = 2.0 on the first three LOC links.",
    "parameter_drift": "parameters: VOT_CAR 45.0 vs approved 38.5; PT_FARE_BASE 2.0 vs approved 2.5.",
    "missing_node_ref": "links: link 90004 (LOC) from an ART node to non-existent node 99998.",
    "null_values": "links: capacity_vph null on the last four ART links.",
    "unused_transit_line": (
        "transit_lines/line_loads: BUS_UNUSED runs along the central ART column with load ~0."
    ),
    "trip_length_shift": (
        "od: HBW/CAR trips reweighted so the trip-weighted mean distance is 1.4 x the unshifted "
        "value (row totals kept). Intended for the scenario variant."
    ),
}
ALL_DEFECTS: frozenset[str] = frozenset(DEFECT_DOCS)
DEMAND_DEFECTS = {
    "negative_matrix_cells",
    "row_col_imbalance",
    "high_intrazonal",
    "trip_length_shift",
}


def validate(defects: set[str] | None) -> set[str]:
    chosen = set(defects or ())
    unknown = chosen - ALL_DEFECTS
    if unknown:
        raise ValueError(f"unknown defects: {sorted(unknown)}; known: {sorted(ALL_DEFECTS)}")
    return chosen


# --- location selection (network only) ------------------------------------------


def _links_of(net: Network, link_class: str, area_type: str | None = None) -> list[int]:
    ln = net.links
    m = ln.link_class == link_class
    if area_type:
        m &= ln.area_type == area_type
    return [int(x) for x in ln.loc[m, "link_id"].sort_values()]


def _ab_lookup(net: Network) -> dict[tuple[int, int], int]:
    ln = net.links
    return {
        (int(a), int(b)): int(i) for a, b, i in zip(ln.a_node, ln.b_node, ln.link_id, strict=True)
    }


def fwy_corridor_links(net: Network, n: int = OVERCAPACITY_N_LINKS) -> list[int]:
    """Eastbound links along the central E-W FWY, west to east."""
    ab = _ab_lookup(net)
    row = net.grid_ids[net.fwy_row]
    ids = [ab[(int(row[c]), int(row[c + 1]))] for c in range(min(n, net.grid - 1))]
    return ids


def low_volume_link(net: Network) -> int:
    cands = _links_of(net, "ART", "URB") or _links_of(net, "ART")
    return cands[0]


def zero_capacity_links(net: Network) -> list[int]:
    cands = _links_of(net, "ART", "SUB") or _links_of(net, "ART")
    return cands[:2]


def zero_speed_links(net: Network) -> list[int]:
    return _links_of(net, "COL")[:2]


def speed_above_links(net: Network) -> list[int]:
    return (_links_of(net, "COL", "URB") or _links_of(net, "COL"))[:3]


def speed_below_links(net: Network) -> list[int]:
    return _links_of(net, "LOC")[:3]


def null_capacity_links(net: Network) -> list[int]:
    return _links_of(net, "ART")[-4:]


def connector_on_fwy_target(net: Network) -> tuple[int, int]:
    """(zone_id, fwy node id) for the misplaced connector."""
    fwy_node = int(net.grid_ids[net.fwy_row, 1])
    return int(net.zones.zone_id.iloc[len(net.zones) // 4]), fwy_node


def missing_node_ref_source(net: Network) -> int:
    art_rows = net.art_rows()
    r = art_rows[0] if art_rows else 0
    return int(net.grid_ids[r, 0])


def imbalance_zone(net: Network) -> int:
    return int(net.zones.zone_id.iloc[net.n_zones // 3])


def intrazonal_zone(net: Network) -> int:
    return int(net.zones.zone_id.iloc[net.n_zones // 2])


def negative_cells(net: Network) -> list[tuple[int, int]]:
    ids = [int(z) for z in net.zones.zone_id]
    return [(ids[0], d) for d in ids[1:6]]


def manifest(defects: set[str], net: Network, lines: list[Line]) -> dict[str, dict[str, object]]:
    """Expected planted locations for each defect (ids only, no data)."""
    out: dict[str, dict[str, object]] = {}
    line_ids = {ln.line_id for ln in lines}
    for d in sorted(defects):
        entry: dict[str, object] = {"description": DEFECT_DOCS[d]}
        if d == "orphan_nodes":
            entry.update(table="nodes", node_ids=list(ORPHAN_NODE_IDS))
        elif d == "zero_capacity_link":
            entry.update(table="links", link_ids=zero_capacity_links(net))
        elif d == "zero_speed_link":
            entry.update(table="links", link_ids=zero_speed_links(net))
        elif d == "oneway_dead_end":
            entry.update(table="links", link_ids=[DEAD_END_LINK_ID], node_ids=[DEAD_END_NODE_ID])
        elif d == "connector_on_fwy":
            zone, node = connector_on_fwy_target(net)
            entry.update(
                table="links",
                link_ids=list(CONNECTOR_ON_FWY_LINK_IDS),
                zone_ids=[zone],
                node_ids=[node],
            )
        elif d == "broken_line_sequence":
            entry.update(table="transit_segments", line_ids=[BROKEN_LINE], seq=[3])
        elif d == "headway_out_of_range":
            entry.update(table="transit_lines", line_ids=[BAD_HEADWAY_LINE], periods=["AM", "NT"])
        elif d == "line_node_not_in_network":
            entry.update(
                table="transit_segments",
                line_ids=[MISSING_NODE_LINE],
                node_ids=[LINE_MISSING_NODE_ID],
            )
        elif d == "land_use_total_mismatch":
            entry.update(table="control_totals", variables=["POP"], factor=1.12)
        elif d == "overcapacity_corridor":
            entry.update(table="link_flows", link_ids=fwy_corridor_links(net), periods=["AM"])
        elif d == "low_volume_outlier":
            entry.update(table="link_flows", link_ids=[low_volume_link(net)], periods=["AM"])
        elif d == "negative_matrix_cells":
            cells = negative_cells(net)
            entry.update(
                table="od",
                matrix=dict(
                    zip(("matrix_kind", "purpose", "mode", "period"), NEGATIVE_MATRIX, strict=True)
                ),
                cells=[list(c) for c in cells],
                zone_ids=sorted({z for c in cells for z in c}),
            )
        elif d == "row_col_imbalance":
            entry.update(table="od", zone_ids=[imbalance_zone(net)], mode="CAR")
        elif d == "high_intrazonal":
            entry.update(table="od", zone_ids=[intrazonal_zone(net)], share=0.4)
        elif d == "poor_convergence":
            entry.update(
                table="convergence", stage="HWY_ASSIGN", periods=["AM"], final_rel_gap=0.02
            )
        elif d == "speed_above_ffs":
            entry.update(table="link_flows", link_ids=speed_above_links(net), periods=["PM"])
        elif d == "speed_below_floor":
            entry.update(table="link_flows", link_ids=speed_below_links(net), periods=["AM"])
        elif d == "parameter_drift":
            entry.update(table="parameters", keys=sorted(DRIFTED_PARAMETERS))
        elif d == "missing_node_ref":
            entry.update(
                table="links", link_ids=[MISSING_NODE_REF_LINK_ID], node_ids=[MISSING_NODE_ID]
            )
        elif d == "null_values":
            entry.update(table="links", link_ids=null_capacity_links(net), columns=["capacity_vph"])
        elif d == "unused_transit_line":
            assert UNUSED_LINE in line_ids
            entry.update(table="line_loads", line_ids=[UNUSED_LINE])
        elif d == "trip_length_shift":
            entry.update(table="od", purposes=["HBW"], modes=["CAR"], factor=1.4)
        out[d] = entry
    return out


# --- demand defects ------------------------------------------------------------


def apply_demand_defects(defects: set[str], demand: Demand, net: Network) -> None:
    zid = {int(z): i for i, z in enumerate(demand.zone_ids)}
    if "trip_length_shift" in defects:
        lengthen_trips(demand, "HBW", "CAR", 1.4)
    if "negative_matrix_cells" in defects:
        mat = demand.matrices[NEGATIVE_MATRIX[1:]]
        for o, d in negative_cells(net):
            mat[zid[o], zid[d]] = -(abs(mat[zid[o], zid[d]]) + 5.0)
    if "row_col_imbalance" in defects:
        i = zid[imbalance_zone(net)]
        for (_purpose, mode, _period), mat in demand.matrices.items():
            if mode == "CAR":
                mat[i, :] *= 4.0
                mat[:, i] *= 0.2
    if "high_intrazonal" in defects:
        i = zid[intrazonal_zone(net)]
        for mat in demand.matrices.values():
            off = mat[i, :].sum() - mat[i, i]
            mat[i, i] = 0.4 / 0.6 * off


# --- table defects -------------------------------------------------------------


def _new_link_row(
    net: Network,
    link_id: int,
    a: int,
    b: int,
    cls: str,
    xy: dict[int, tuple[float, float]],
    oneway: bool,
    length_m: float | None = None,
) -> dict[str, object]:
    lanes, cap_lane, ffs = CLASS_PARAMS[cls]
    ax, ay = xy[a]
    bx, by = xy.get(b, (ax + 0.004, ay + 0.002))
    length = length_m if length_m is not None else float(haversine_m(ax, ay, bx, by))
    return {
        "link_id": link_id,
        "a_node": a,
        "b_node": b,
        "length_m": round(length, 1),
        "link_class": cls,
        "area_type": "URB",
        "lanes": lanes,
        "capacity_vph": 9999.0 if cls == "CONN" else lanes * cap_lane,
        "ffs_kph": ffs,
        "oneway": oneway,
        "toll_point": False,
        "junction_type": "NONE",
        "sector_id": str(net.links.sector_id.iloc[0]),
        "geometry_wkt": linestring_wkt(ax, ay, bx, by),
    }


def _flow_rows_for_links(
    tables: dict[str, pd.DataFrame], link_ids: list[int], volume: float
) -> None:
    """Add near-empty flow rows for links added by defects, so joins stay total."""
    template = tables["link_flows"]
    keys = template[["period", "user_class"]].drop_duplicates()
    rows = []
    for link_id in link_ids:
        for period, uc in zip(keys.period, keys.user_class, strict=True):
            rows.append(
                {
                    "link_id": link_id,
                    "period": period,
                    "user_class": uc,
                    "volume": volume,
                    "vc_ratio": 0.0,
                    "cong_time_s": 30.0,
                    "cong_speed_kph": 30.0,
                    "delay_s": 0.0,
                }
            )
    tables["link_flows"] = pd.concat([template, pd.DataFrame(rows)], ignore_index=True)


def _rescale_flows(
    tables: dict[str, pd.DataFrame],
    net: Network,
    link_id: int,
    period: str,
    factor: float,
) -> None:
    """Scale every class volume of one link/period and recompute vc, time, speed and delay."""
    lf = tables["link_flows"]
    link = net.links.loc[net.links.link_id == link_id].iloc[0]
    hours = tables["_period_hours"][period]
    m = (lf.link_id == link_id) & (lf.period == period)
    lf.loc[m, "volume"] = np.round(lf.loc[m, "volume"] * factor, 2)
    total = float(lf.loc[m & (lf.user_class == "ALL"), "volume"].iloc[0])
    vc = total / (float(link.capacity_vph) * hours)
    t0 = float(link.length_m) / (float(link.ffs_kph) / 3.6)
    t = float(bpr_time(np.array([t0]), np.array([vc]))[0])
    lf.loc[m, "vc_ratio"] = round(vc, 4)
    lf.loc[m, "cong_time_s"] = round(t, 2)
    lf.loc[m, "cong_speed_kph"] = round(float(link.length_m) / t * 3.6, 2)
    lf.loc[m, "delay_s"] = np.round(lf.loc[m, "delay_s"] * (1 + max(vc - 1, 0)), 2)
    itf = tables["iteration_flows"]
    mi = (itf.link_id == link_id) & (itf.period == period)
    itf.loc[mi, "volume"] = np.round(itf.loc[mi, "volume"] * factor, 2)


def apply_table_defects(
    defects: set[str], tables: dict[str, pd.DataFrame], net: Network, lines: list[Line]
) -> None:
    """Mutate the finished tables in place. ``tables['_period_hours']`` must be present."""
    links = tables["links"]
    xy = net.node_xy()

    if "orphan_nodes" in defects:
        extra = pd.DataFrame(
            {
                "node_id": ORPHAN_NODE_IDS,
                "x": [LON_MIN + 0.002, LON_MAX - 0.002, LON_MIN + 0.002],
                "y": [LAT_MIN + 0.002, LAT_MIN + 0.002, LAT_MAX - 0.002],
                "is_centroid": False,
                "junction_control": "NONE",
            }
        )
        tables["nodes"] = pd.concat([tables["nodes"], extra], ignore_index=True)

    new_links: list[dict[str, object]] = []
    if "oneway_dead_end" in defects:
        src = int(net.grid_ids[0, 1])
        sx, sy = xy[src]
        xy[DEAD_END_NODE_ID] = (sx + 0.003, sy - 0.0025)
        tables["nodes"] = pd.concat(
            [
                tables["nodes"],
                pd.DataFrame(
                    {
                        "node_id": [DEAD_END_NODE_ID],
                        "x": [xy[DEAD_END_NODE_ID][0]],
                        "y": [xy[DEAD_END_NODE_ID][1]],
                        "is_centroid": [False],
                        "junction_control": ["NONE"],
                    }
                ),
            ],
            ignore_index=True,
        )
        new_links.append(
            _new_link_row(net, DEAD_END_LINK_ID, src, DEAD_END_NODE_ID, "LOC", xy, True)
        )
    if "connector_on_fwy" in defects:
        zone, node = connector_on_fwy_target(net)
        new_links.append(
            _new_link_row(net, CONNECTOR_ON_FWY_LINK_IDS[0], zone, node, "CONN", xy, False)
        )
        new_links.append(
            _new_link_row(net, CONNECTOR_ON_FWY_LINK_IDS[1], node, zone, "CONN", xy, False)
        )
    if "missing_node_ref" in defects:
        src = missing_node_ref_source(net)
        new_links.append(
            _new_link_row(
                net, MISSING_NODE_REF_LINK_ID, src, MISSING_NODE_ID, "LOC", xy, False, 350.0
            )
        )
    if new_links:
        links = pd.concat([links, pd.DataFrame(new_links)], ignore_index=True)
        tables["links"] = links
        _flow_rows_for_links(tables, [int(r["link_id"]) for r in new_links], 3.0)

    if "zero_capacity_link" in defects:
        links.loc[links.link_id.isin(zero_capacity_links(net)), "capacity_vph"] = 0.0
    if "zero_speed_link" in defects:
        links.loc[links.link_id.isin(zero_speed_links(net)), "ffs_kph"] = 0.0
    if "null_values" in defects:
        links.loc[links.link_id.isin(null_capacity_links(net)), "capacity_vph"] = np.nan

    if "broken_line_sequence" in defects:
        for name in ("transit_segments", "line_loads"):
            df = tables[name]
            keep = ~((df.line_id == BROKEN_LINE) & (df.seq == 3))
            df = df.loc[keep].copy()
            m = (df.line_id == BROKEN_LINE) & (df.seq > 3)
            df.loc[m, "seq"] = df.loc[m, "seq"] - 1
            tables[name] = df.reset_index(drop=True)
    if "headway_out_of_range" in defects:
        tl = tables["transit_lines"]
        tl.loc[(tl.line_id == BAD_HEADWAY_LINE) & (tl.period == "AM"), "headway_min"] = 0.5
        tl.loc[(tl.line_id == BAD_HEADWAY_LINE) & (tl.period == "NT"), "headway_min"] = 240.0
    if "line_node_not_in_network" in defects:
        ts = tables["transit_segments"]
        ts.loc[(ts.line_id == MISSING_NODE_LINE) & (ts.seq == 2), "to_node"] = LINE_MISSING_NODE_ID
        ts.loc[(ts.line_id == MISSING_NODE_LINE) & (ts.seq == 3), "from_node"] = (
            LINE_MISSING_NODE_ID
        )

    if "land_use_total_mismatch" in defects:
        ct = tables["control_totals"]
        ct.loc[ct.variable == "POP", "value"] = np.round(
            ct.loc[ct.variable == "POP", "value"] * 1.12
        )

    if "overcapacity_corridor" in defects:
        lf = tables["link_flows"]
        hours = tables["_period_hours"]["AM"]
        for i, link_id in enumerate(fwy_corridor_links(net)):
            link = net.links.loc[net.links.link_id == link_id].iloc[0]
            m = (lf.link_id == link_id) & (lf.period == "AM") & (lf.user_class == "ALL")
            current = float(lf.loc[m, "volume"].iloc[0])
            target_vc = OVERCAPACITY_VC_START + OVERCAPACITY_VC_STEP * i
            target = target_vc * float(link.capacity_vph) * hours
            _rescale_flows(tables, net, link_id, "AM", target / current)
    if "low_volume_outlier" in defects:
        lf = tables["link_flows"]
        link_id = low_volume_link(net)
        peers = net.links.loc[
            (net.links.link_class == "ART") & (net.links.area_type == "URB"), "link_id"
        ]
        m_peer = lf.link_id.isin(peers) & (lf.period == "AM") & (lf.user_class == "ALL")
        median = float(lf.loc[m_peer, "volume"].median())
        m = (lf.link_id == link_id) & (lf.period == "AM") & (lf.user_class == "ALL")
        current = float(lf.loc[m, "volume"].iloc[0])
        _rescale_flows(tables, net, link_id, "AM", 0.01 * median / current)

    if "speed_above_ffs" in defects:
        lf = tables["link_flows"]
        for link_id in speed_above_links(net):
            link = net.links.loc[net.links.link_id == link_id].iloc[0]
            m = (lf.link_id == link_id) & (lf.period == "PM")
            speed = round(float(link.ffs_kph) * 1.15, 2)
            lf.loc[m, "cong_speed_kph"] = speed
            lf.loc[m, "cong_time_s"] = round(float(link.length_m) / (speed / 3.6), 2)
    if "speed_below_floor" in defects:
        lf = tables["link_flows"]
        for link_id in speed_below_links(net):
            link = net.links.loc[net.links.link_id == link_id].iloc[0]
            m = (lf.link_id == link_id) & (lf.period == "AM")
            lf.loc[m, "cong_speed_kph"] = 2.0
            lf.loc[m, "cong_time_s"] = round(float(link.length_m) / (2.0 / 3.6), 2)

    if "parameter_drift" in defects:
        pr = tables["parameters"]
        for key, (value, approved) in DRIFTED_PARAMETERS.items():
            pr.loc[pr.key == key, "value"] = value
            pr.loc[pr.key == key, "approved_value"] = approved
