"""Traffic assignment: AON, incremental BPR, MSA, and Frank-Wolfe UE.

All methods share one all-or-nothing (AON) building block: for each origin run
Dijkstra on the current link costs, then load that origin's demand onto the
shortest-path tree. Determinism is guaranteed by iterating origins in sorted
order and using only deterministic float ops, so two identical runs are
bit-for-bit identical (acceptance test 4).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional

import numpy as np

from ..config import Params
from ..graph import CSRGraph
from .kernels import dijkstra, load_tree, edge_tails_from_csr


@dataclass
class AssignResult:
    volume: np.ndarray            # float32 per-link volume (veh/h, PCE)
    cost: np.ndarray              # float32 per-link congested time (s)
    free_flow_time: np.ndarray    # float32 per-link free-flow time (s)
    capacity: np.ndarray          # float32 per-link capacity
    length_m: np.ndarray          # float32 per-link length
    gap_history: List[float] = field(default_factory=list)
    iterations: int = 0
    method: str = ""

    @property
    def vc(self) -> np.ndarray:
        return self.volume / np.maximum(self.capacity, 1.0)


def bpr(free_flow_time, volume, capacity, alpha, beta):
    """BPR volume-delay: t = ff * (1 + alpha*(v/cap)^beta)."""
    x = volume / np.maximum(capacity, 1.0)
    return free_flow_time * (1.0 + alpha * np.power(x, beta))


def _prep(net, graph: CSRGraph):
    tails = edge_tails_from_csr(graph.indptr, graph.n_edges)
    return tails


def _aon_load(graph: CSRGraph, tails, costs, origins, dest_idx_by_o,
              dest_node, trips_by_o, n_links) -> np.ndarray:
    """All-or-nothing load of a demand set onto link costs ``costs``.

    origins:        int64 array of origin node indices (one per active origin)
    dest_node:      int64 array of destination node indices (global)
    dest_idx_by_o:  list of int64 arrays: indices into dest_node/trips per origin
    trips_by_o:     list of float32 arrays of trips per origin
    """
    flow = np.zeros(n_links, dtype=np.float32)
    # costs are per-LINK; the CSR Dijkstra needs per-EDGE weights.
    w = costs.astype(np.float32)[graph.edge_link]
    for k in range(len(origins)):
        src = int(origins[k])
        _, pred = dijkstra(graph.indptr, graph.head, w, src, graph.n_nodes)
        dn = dest_node[dest_idx_by_o[k]]
        dt = trips_by_o[k]
        load_tree(pred, graph.edge_link, tails, dn, dt, src, flow)
    return flow


class Demand:
    """Origin-bucketed demand ready for assignment.

    Built from index-form OD (origin node, dest node, trips) by grouping on
    origin. Honours an optional origin sample (largest-demand origins first)
    and a global scale (period factor * growth).
    """

    def __init__(self, origins, dest_node, dest_idx_by_o, trips_by_o, total):
        self.origins = origins
        self.dest_node = dest_node
        self.dest_idx_by_o = dest_idx_by_o
        self.trips_by_o = trips_by_o
        self.total = total

    @classmethod
    def from_index(cls, o_node, d_node, trips, n_nodes, sample=0, scale=1.0):
        trips = trips.astype(np.float32) * np.float32(scale)
        order = np.argsort(o_node, kind="stable")
        o_node, d_node, trips = o_node[order], d_node[order], trips[order]
        uniq, starts = np.unique(o_node, return_index=True)
        ends = np.append(starts[1:], len(o_node))
        origins, dest_idx_by_o, trips_by_o = [], [], []
        all_dest = d_node
        for u, s, e in zip(uniq, starts, ends):
            origins.append(int(u))
            dest_idx_by_o.append(np.arange(s, e, dtype=np.int64))
            trips_by_o.append(trips[s:e])
        origins = np.asarray(origins, dtype=np.int64)
        if sample and sample < len(origins):
            mass = np.array([t.sum() for t in trips_by_o])
            keep = np.argsort(mass)[::-1][:sample]
            keep.sort()
            origins = origins[keep]
            dest_idx_by_o = [dest_idx_by_o[i] for i in keep]
            trips_by_o = [trips_by_o[i] for i in keep]
        total = float(sum(t.sum() for t in trips_by_o))
        return cls(origins, all_dest, dest_idx_by_o, trips_by_o, total)


ProgressFn = Callable[[dict], None]


def assign(method, net, graph, demand: Demand, params: Params,
           progress: Optional[ProgressFn] = None) -> AssignResult:
    method = method.lower()
    tails = _prep(net, graph)
    n = net.n_links
    ff = net.free_flow_time_s.astype(np.float32)
    cap = net.capacity.astype(np.float32)
    a, b = params.alpha, params.beta

    def emit(msg):
        if progress:
            progress(msg)

    def aon(costs):
        return _aon_load(graph, tails, costs, demand.origins,
                         demand.dest_idx_by_o, demand.dest_node,
                         demand.trips_by_o, n)

    gap_hist: List[float] = []

    if method == "aon":
        vol = aon(ff)
        cost = bpr(ff, vol, cap, a, b)
        emit({"phase": "done", "method": "aon"})
        return AssignResult(vol, cost, ff, cap, net.length_m, gap_hist, 1, "aon")

    if method == "bpr":
        # incremental: 4 increments of demand, recosting after each
        vol = np.zeros(n, dtype=np.float32)
        increments = [0.4, 0.3, 0.2, 0.1]
        for i, frac in enumerate(increments):
            cost = bpr(ff, vol, cap, a, b)
            scaled = Demand(demand.origins, demand.dest_node,
                            demand.dest_idx_by_o,
                            [t * frac for t in demand.trips_by_o], 0)
            inc = _aon_load(graph, tails, cost, scaled.origins,
                            scaled.dest_idx_by_o, scaled.dest_node,
                            scaled.trips_by_o, n)
            vol += inc
            emit({"phase": "iter", "method": "bpr", "iter": i + 1,
                  "total": len(increments)})
        cost = bpr(ff, vol, cap, a, b)
        return AssignResult(vol, cost, ff, cap, net.length_m, gap_hist,
                            len(increments), "bpr")

    if method == "msa":
        vol = aon(ff)
        for i in range(2, params.fw_max_iter + 1):
            cost = bpr(ff, vol, cap, a, b)
            y = aon(cost)
            step = 1.0 / i
            vol = (1.0 - step) * vol + step * y
            gap = _relative_gap(vol, y, cost)
            gap_hist.append(gap)
            emit({"phase": "iter", "method": "msa", "iter": i,
                  "total": params.fw_max_iter, "gap": gap})
            if gap < params.fw_gap_tol:
                break
        cost = bpr(ff, vol, cap, a, b)
        return AssignResult(vol, cost, ff, cap, net.length_m, gap_hist,
                            len(gap_hist) + 1, "msa")

    if method in ("fw", "frank-wolfe", "ue"):
        return _frank_wolfe(net, graph, demand, params, tails, aon, emit)

    raise ValueError(f"Unknown assignment method: {method}")


def _relative_gap(x, y, cost):
    """(TSTT - SPTT) / SPTT for the current solution.

    TSTT = sum(cost*x), SPTT = sum(cost*y) where y is the AON (cheapest) load.
    """
    tstt = float(np.dot(cost, x))
    sptt = float(np.dot(cost, y))
    if sptt <= 0:
        return 0.0
    return abs(tstt - sptt) / sptt


def _frank_wolfe(net, graph, demand, params, tails, aon, emit) -> AssignResult:
    ff = net.free_flow_time_s.astype(np.float32)
    cap = net.capacity.astype(np.float32)
    a, b = params.alpha, params.beta

    # iteration 1: AON at free flow
    x = aon(ff)
    gap_hist: List[float] = []
    it = 1
    for it in range(2, params.fw_max_iter + 1):
        cost = bpr(ff, x, cap, a, b)
        y = aon(cost)                       # direction-finding AON
        gap = _relative_gap(x, y, cost)
        gap_hist.append(gap)
        emit({"phase": "iter", "method": "fw", "iter": it,
              "total": params.fw_max_iter, "gap": gap})
        if gap < params.fw_gap_tol:
            x = x  # converged
            break
        # optimal step lambda by bisection on Beckmann derivative
        lam = _bisection_step(ff, cap, a, b, x, y)
        x = x + lam * (y - x)
    cost = bpr(ff, x, cap, a, b)
    return AssignResult(x, cost, ff, cap, net.length_m, gap_hist, it, "fw")


def _bisection_step(ff, cap, alpha, beta, x, y, tol=1e-6, max_iter=40):
    """Find lambda in [0,1] minimising the Beckmann objective along x->y.

    D(lambda) = sum (y-x) * t(x + lambda*(y-x)); root of D gives the optimum.
    """
    d = y - x
    def deriv(lam):
        v = x + lam * d
        t = bpr(ff, v, cap, alpha, beta)
        return float(np.dot(d, t))
    lo, hi = 0.0, 1.0
    dlo, dhi = deriv(lo), deriv(hi)
    if dlo >= 0:          # already optimal at x
        return 0.0
    if dhi <= 0:          # full step is best
        return 1.0
    for _ in range(max_iter):
        mid = 0.5 * (lo + hi)
        dm = deriv(mid)
        if abs(dm) < tol:
            return mid
        if dm > 0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)
