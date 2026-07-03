"""Post-assignment analysis: KPIs, congested-link tables, histograms,
connectivity checks and CSV export."""

from __future__ import annotations

import csv
from dataclasses import dataclass

import numpy as np

from steam_core.classify import class_name
from steam_core.network import Network
from steam_core.graph import CSRGraph
from .assignment import AssignmentResult
from .bpr import los_label, LOS_LABELS


@dataclass
class KPIs:
    vht: float                # vehicle-hours travelled
    vmt: float                # vehicle-km travelled
    avg_speed: float          # km/h (VMT/VHT)
    avg_vc: float             # volume-weighted v/c
    total_delay: float        # vehicle-hours of delay
    over_capacity: int        # links with v/c > 1
    n_loaded: int             # links carrying flow

    def as_rows(self) -> list[tuple[str, str]]:
        return [
            ("VHT (veh-h)", f"{self.vht:,.0f}"),
            ("VMT (veh-km)", f"{self.vmt:,.0f}"),
            ("Avg network speed (km/h)", f"{self.avg_speed:,.1f}"),
            ("Avg v/c (vol-weighted)", f"{self.avg_vc:,.3f}"),
            ("Total delay (veh-h)", f"{self.total_delay:,.0f}"),
            ("Over-capacity links", f"{self.over_capacity:,d}"),
            ("Loaded links", f"{self.n_loaded:,d}"),
        ]


def network_kpis(net: Network, res: AssignmentResult,
                 mask: np.ndarray | None = None) -> KPIs:
    vol = res.volume
    if mask is not None:
        vol = np.where(mask, vol, 0.0)
    length_km = net.length / 1000.0
    hours = res.congested_time / 3600.0
    free_hours = res.free_time / 3600.0

    vmt = float(np.sum(vol * length_km))
    vht = float(np.sum(vol * hours))
    delay = float(np.sum(vol * (hours - free_hours)))
    avg_speed = vmt / vht if vht > 0 else 0.0
    wsum = float(np.sum(vol))
    avg_vc = float(np.sum(res.vc * vol) / wsum) if wsum > 0 else 0.0
    return KPIs(
        vht=vht, vmt=vmt, avg_speed=avg_speed, avg_vc=avg_vc,
        total_delay=delay, over_capacity=int(np.sum(res.vc > 1.0)),
        n_loaded=int(np.sum(vol > 0)),
    )


def kpis_by_class(net: Network, res: AssignmentResult) -> dict[str, KPIs]:
    out: dict[str, KPIs] = {}
    for code in np.unique(net.klass):
        name = class_name(code)
        out[name] = network_kpis(net, res, mask=(net.klass == code))
    return out


def top_congested(net: Network, res: AssignmentResult, n: int = 25):
    """Links ranked by total delay = vol * (congested - free) time."""
    delay = res.volume * (res.congested_time - res.free_time)
    order = np.argsort(delay)[::-1][:n]
    rows = []
    for i in order:
        rows.append({
            "link_id": int(net.link_id[i]),
            "class": class_name(net.klass[i]),
            "lanes": int(net.lanes[i]),
            "volume": float(res.volume[i]),
            "capacity": float(res.capacity[i]),
            "vc": float(res.vc[i]),
            "los": los_label(res.los[i]),
            "delay_vehh": float(delay[i] / 3600.0),
        })
    return rows


def vc_histogram(res: AssignmentResult, edges: np.ndarray | None = None):
    """Histogram of v/c over loaded links."""
    if edges is None:
        edges = np.array([0, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, np.inf])
    loaded = res.vc[res.volume > 0]
    counts, _ = np.histogram(loaded, bins=edges)
    labels = []
    for i in range(len(edges) - 1):
        hi = edges[i + 1]
        labels.append(f"{edges[i]:.1f}-{'inf' if np.isinf(hi) else f'{hi:.1f}'}")
    return labels, counts


def los_distribution(res: AssignmentResult) -> dict[str, int]:
    loaded = res.los[res.volume > 0]
    return {LOS_LABELS[i]: int(np.sum(loaded == i)) for i in range(6)}


def connectivity_check(net: Network, graph: CSRGraph,
                       zone_node: np.ndarray | None = None) -> dict:
    """Weakly-connected components + zones not on the main component."""
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import connected_components

    n = graph.n_nodes
    data = np.ones(graph.n_edges)
    adj = csr_matrix((data, graph.indices, graph.indptr), shape=(n, n))
    n_comp, labels = connected_components(adj, directed=False)
    sizes = np.bincount(labels)
    main = int(np.argmax(sizes))
    result = {
        "components": int(n_comp),
        "main_component_nodes": int(sizes[main]),
        "isolated_nodes": int(np.sum(sizes[labels] < sizes[main])),
    }
    if zone_node is not None:
        connected = zone_node[zone_node >= 0]
        off = int(np.sum(labels[connected] != main))
        result["zones_off_main"] = off
    return result


def export_links_csv(path, net: Network, res: AssignmentResult) -> None:
    with open(path, "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["link_id", "class", "ltype", "lanes", "length_m",
                     "capacity", "volume", "vc", "los", "free_time_s",
                     "congested_time_s"])
        for i in range(net.n_links):
            wr.writerow([
                int(net.link_id[i]), class_name(net.klass[i]),
                int(net.ltype[i]), int(net.lanes[i]),
                round(float(net.length[i]), 2), round(float(res.capacity[i]), 1),
                round(float(res.volume[i]), 2), round(float(res.vc[i]), 4),
                los_label(res.los[i]), round(float(res.free_time[i]), 2),
                round(float(res.congested_time[i]), 2),
            ])
