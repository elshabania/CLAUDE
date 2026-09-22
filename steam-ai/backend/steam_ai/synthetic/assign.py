"""Crude highway assignment for the synthetic run.

A few iterations of the method of successive averages (all-or-nothing shortest
paths with BPR congested times, averaged) load the CAR demand of each period
onto the grid network. LGV and HGV are derived as fixed proportions of CAR plus
a class-specific background flow, and ``ALL`` is their sum. This is a toy
loading, not a converged equilibrium; the reported convergence series is a
deterministic geometric decay written so the tables look like a real run's.

The pure-Python Dijkstra is fast enough because the network is small (a few
hundred nodes); scipy is deliberately not required.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .network import Network

BPR_ALPHA = 0.15
BPR_BETA = 4.0
MSA_ITERATIONS = 6
REPORTED_ITERATIONS = 20  # iterations reported in the convergence table
NOISE_ITERATIONS = 3  # last iterations written to iteration_flows
NOISE_SD = 0.004  # relative iteration-to-iteration noise in final volumes
FINAL_REL_GAP = 0.0005
USER_CLASSES = ["CAR", "LGV", "HGV", "ALL"]
LGV_SHARE_OF_CAR = 0.12
HGV_SHARE_OF_CAR = 0.03
# background flow per lane per hour by class (external / unmodelled traffic)
BACKGROUND_PER_LANE_HOUR = {"FWY": 320.0, "ART": 80.0, "COL": 30.0, "LOC": 12.0, "CONN": 0.0}
PERIOD_BACKGROUND_FACTOR = {"AM": 1.0, "MD": 0.7, "PM": 1.0, "EV": 0.5, "NT": 0.2}
HGV_BACKGROUND_SHARE = {"FWY": 0.15, "ART": 0.06, "COL": 0.02, "LOC": 0.0, "CONN": 0.0}
JUNCTION_DELAY_S = {"SIGNAL": (15.0, 25.0), "ROUNDABOUT": (5.0, 10.0), "PRIORITY": (3.0, 6.0)}


@dataclass
class Graph:
    node_ids: np.ndarray
    index: dict[int, int]
    is_centroid: np.ndarray
    link_a: np.ndarray  # node index of a_node per link
    link_b: np.ndarray
    adj: list[list[tuple[int, int]]]  # node -> [(neighbour index, link index)]
    n_links: int


def build_graph(net: Network) -> Graph:
    node_ids = net.nodes.node_id.to_numpy().astype(np.int64)
    index = {int(n): i for i, n in enumerate(node_ids)}
    is_centroid = net.nodes.is_centroid.to_numpy().astype(bool)
    link_a = np.array([index[int(n)] for n in net.links.a_node], dtype=np.int64)
    link_b = np.array([index[int(n)] for n in net.links.b_node], dtype=np.int64)
    adj: list[list[tuple[int, int]]] = [[] for _ in node_ids]
    for li, (a, b) in enumerate(zip(link_a, link_b, strict=True)):
        adj[a].append((int(b), li))
    return Graph(node_ids, index, is_centroid, link_a, link_b, adj, len(link_a))


def dijkstra(graph: Graph, source: int, cost: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Shortest-path tree from ``source``; centroids other than the source are not expanded."""
    n = len(graph.node_ids)
    dist = np.full(n, np.inf)
    pred_link = np.full(n, -1, dtype=np.int64)
    dist[source] = 0.0
    heap = [(0.0, source)]
    cost_list = cost.tolist()
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        if u != source and graph.is_centroid[u]:
            continue
        for v, li in graph.adj[u]:
            nd = d + cost_list[li]
            if nd < dist[v]:
                dist[v] = nd
                pred_link[v] = li
                heapq.heappush(heap, (nd, v))
    return dist, pred_link


def all_or_nothing(
    graph: Graph, cost: np.ndarray, demand: np.ndarray, centroid_index: np.ndarray
) -> np.ndarray:
    """Load a dense zone-to-zone matrix onto the network along shortest paths."""
    vol = np.zeros(graph.n_links)
    n_nodes = len(graph.node_ids)
    for oi, src in enumerate(centroid_index):
        row = demand[oi]
        if row.sum() <= 0:
            continue
        dist, pred = dijkstra(graph, int(src), cost)
        acc = np.zeros(n_nodes)
        acc[centroid_index] = row
        acc[src] = 0.0  # intrazonal trips do not use the network
        reachable = np.where(np.isfinite(dist) & (acc > 0))[0]
        # Walk each destination back to the origin adding its trips to the tree.
        for v in reachable:
            w = acc[v]
            node = v
            while node != src:
                li = pred[node]
                if li < 0:
                    break
                vol[li] += w
                node = graph.link_a[li]
    return vol


def bpr_time(t0: np.ndarray, vc: np.ndarray) -> np.ndarray:
    return t0 * (1.0 + BPR_ALPHA * np.power(vc, BPR_BETA))


@dataclass
class AssignmentResult:
    link_flows: pd.DataFrame  # schema.LINK_FLOWS minus source_* columns
    iteration_flows: pd.DataFrame  # schema.ITERATION_FLOWS minus source_file
    convergence: pd.DataFrame  # schema.CONVERGENCE minus source_* columns
    car_volume: dict[str, np.ndarray]  # period -> assigned CAR volume per link (pre-background)


def assign(
    net: Network,
    car_demand: dict[str, np.ndarray],
    period_hours: dict[str, float],
    seed: int,
    poor_convergence_periods: set[str] | None = None,
) -> AssignmentResult:
    """Assign CAR demand per period and derive the flow, noise and convergence tables."""
    rng = np.random.default_rng(seed + 101)
    graph = build_graph(net)
    links = net.links
    centroid_index = np.array([graph.index[int(z)] for z in net.zones.zone_id], dtype=np.int64)
    length_m = links.length_m.to_numpy()
    ffs = links.ffs_kph.to_numpy()
    t0 = length_m / (ffs / 3.6)
    cap_vph = links.capacity_vph.to_numpy()
    lanes = links.lanes.to_numpy().astype(float)
    cls = links.link_class.to_numpy()
    jt = links.junction_type.to_numpy()
    bg_lane = np.array([BACKGROUND_PER_LANE_HOUR[c] for c in cls])
    hgv_bg_share = np.array([HGV_BACKGROUND_SHARE[c] for c in cls])
    poor = poor_convergence_periods or set()

    flow_frames, iter_frames, conv_rows = [], [], []
    car_volume: dict[str, np.ndarray] = {}
    for period, hours in period_hours.items():
        cap_period = cap_vph * hours
        background = bg_lane * lanes * hours * PERIOD_BACKGROUND_FACTOR[period]
        demand = car_demand[period]
        vol = np.zeros(graph.n_links)
        for k in range(1, MSA_ITERATIONS + 1):
            total = vol * (1 + LGV_SHARE_OF_CAR + HGV_SHARE_OF_CAR) + background
            cost = bpr_time(t0, total / cap_period)
            aon = all_or_nothing(graph, cost, demand, centroid_index)
            vol = vol + (aon - vol) / k
        car_volume[period] = vol.copy()

        car = vol + background * 0.80
        lgv = vol * LGV_SHARE_OF_CAR + background * 0.20 * (1 - hgv_bg_share)
        hgv = vol * HGV_SHARE_OF_CAR + background * 0.20 * hgv_bg_share
        total = car + lgv + hgv
        vc = total / cap_period
        t_cong = bpr_time(t0, vc)
        speed = length_m / t_cong * 3.6
        delay = np.zeros_like(vc)
        for code, (fixed, var) in JUNCTION_DELAY_S.items():
            m = jt == code
            delay[m] = fixed + var * vc[m] ** 2
        delay[cls == "CONN"] = 0.0

        for user_class, volume in (("CAR", car), ("LGV", lgv), ("HGV", hgv), ("ALL", total)):
            flow_frames.append(
                pd.DataFrame(
                    {
                        "link_id": links.link_id.to_numpy(),
                        "period": period,
                        "user_class": user_class,
                        "volume": np.round(volume, 2),
                        "vc_ratio": np.round(vc, 4),
                        "cong_time_s": np.round(t_cong, 2),
                        "cong_speed_kph": np.round(speed, 2),
                        "delay_s": np.round(delay, 2),
                    }
                )
            )

        first_noise = REPORTED_ITERATIONS - NOISE_ITERATIONS + 1
        for it in range(first_noise, REPORTED_ITERATIONS + 1):
            noise = (
                1.0 if it == REPORTED_ITERATIONS else 1.0 + rng.normal(0.0, NOISE_SD, len(total))
            )
            iter_frames.append(
                pd.DataFrame(
                    {
                        "link_id": links.link_id.to_numpy(),
                        "period": period,
                        "iteration": np.int32(it),
                        "volume": np.round(total * noise, 2),
                    }
                )
            )

        final_gap = 0.02 if period in poor else FINAL_REL_GAP
        conv_rows.extend(_convergence_series("HWY_ASSIGN", period, final_gap, total, rng))

    conv_rows.extend(_demand_loop_series(rng))
    return AssignmentResult(
        link_flows=pd.concat(flow_frames, ignore_index=True),
        iteration_flows=pd.concat(iter_frames, ignore_index=True),
        convergence=pd.DataFrame(conv_rows),
        car_volume=car_volume,
    )


def _convergence_series(
    stage: str, period: str, final_gap: float, total: np.ndarray, rng: np.random.Generator
) -> list[dict[str, object]]:
    """Geometric decay of REL_GAP from 0.2 to ``final_gap``, with matching GEH and flow-change series."""
    its = np.arange(1, REPORTED_ITERATIONS + 1)
    start = 0.2
    ratio = (final_gap / start) ** (1.0 / (REPORTED_ITERATIONS - 1))
    gap = start * ratio ** (its - 1) * (1.0 + rng.uniform(-0.08, 0.08, len(its)))
    gap[-1] = final_gap
    geh = 8.0 * (gap / start) ** 0.6
    max_change = float(np.percentile(total, 99)) * 0.5 * (gap / start) ** 0.8
    rows: list[dict[str, object]] = []
    for i, it in enumerate(its):
        for metric, value in (
            ("REL_GAP", gap[i]),
            ("GEH_PREV_ITER", geh[i]),
            ("MAX_FLOW_CHANGE", max_change[i]),
        ):
            rows.append(
                {
                    "stage": stage,
                    "period": period,
                    "iteration": int(it),
                    "metric": metric,
                    "value": round(float(value), 6),
                }
            )
    return rows


def _demand_loop_series(rng: np.random.Generator) -> list[dict[str, object]]:
    gaps = 0.1 * (0.45 ** np.arange(5)) * (1.0 + rng.uniform(-0.05, 0.05, 5))
    return [
        {
            "stage": "DEMAND_LOOP",
            "period": "ALL",
            "iteration": i + 1,
            "metric": "REL_GAP",
            "value": round(float(g), 6),
        }
        for i, g in enumerate(gaps)
    ]
