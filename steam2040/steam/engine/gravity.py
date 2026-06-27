"""Land-use gravity demand model (spec section 3.3).

Productions  P_i = r_pop*POP + r_wkr*WORKER + r_stu*STUDENT
Attractions  A_j = a_ret*RETAIL_GFA + a_off*OFFICE_GFA + a_ind*IND_GFA + a_sch*SCHOOL_GFA
Deterrence   f(c) = exp(-beta * minutes), minutes from the live congested skim
Distribution production-constrained singly (optionally Furness-balanced).

Returns demand in index form (origin node, dest node, trips) ready to feed
:class:`steam.engine.assignment.Demand`.
"""
from __future__ import annotations

import numpy as np

from ..config import Params
from ..data.zones import Zones
from ..graph import CSRGraph
from .kernels import dijkstra


def productions(zones: Zones, p: Params) -> np.ndarray:
    return (p.r_pop * zones.pop + p.r_wkr * zones.worker +
            p.r_stu * zones.student).astype(np.float64)


def attractions(zones: Zones, p: Params) -> np.ndarray:
    return (p.a_ret * zones.retail_gfa + p.a_off * zones.office_gfa +
            p.a_ind * zones.ind_gfa + p.a_sch * zones.school_gfa).astype(np.float64)


def build_gravity_demand(zones: Zones, graph: CSRGraph, params: Params,
                         furness: bool = False, max_furness: int = 10):
    """Compute a production-constrained gravity matrix on the current skim.

    Only routable zones with a connected node participate. Skims are computed
    with one Dijkstra per origin zone node on the *current* graph weights
    (caller should pass a congested graph for the "live skim" behaviour).
    Returns (o_node, d_node, trips) index arrays and total productions.
    """
    mask = zones.routable & (zones.node is not None)
    idx = np.nonzero(zones.routable)[0]
    nodes = zones.node[idx]
    valid = nodes >= 0
    idx = idx[valid]
    nodes = nodes[valid]

    P = productions(zones, params)[idx]
    A = attractions(zones, params)[idx]
    if A.sum() <= 0:
        A = np.ones_like(A)            # avoid div-by-zero; uniform attraction
    beta = params.beta_grav
    nz = len(idx)

    o_node, d_node, trips = [], [], []
    total_prod = float(P.sum())

    # skim minutes between zone nodes (origin -> all, then pick zone nodes)
    for k in range(nz):
        src = int(nodes[k])
        dist, _ = dijkstra(graph.indptr, graph.head, graph.weight, src,
                           graph.n_nodes)
        minutes = dist[nodes] / 60.0
        f = np.exp(-beta * minutes)
        f[k] = 0.0                     # no intrazonal on the network
        denom = float(np.dot(A, f))
        if denom <= 0 or P[k] <= 0:
            continue
        row = P[k] * (A * f) / denom   # production-constrained shares
        nzj = np.nonzero(row > 1e-6)[0]
        for j in nzj:
            o_node.append(src)
            d_node.append(int(nodes[j]))
            trips.append(float(row[j]))

    o = np.asarray(o_node, dtype=np.int64)
    d = np.asarray(d_node, dtype=np.int64)
    t = np.asarray(trips, dtype=np.float32)

    if furness and len(t):
        t = _furness(o, d, t, idx, nodes, A, max_furness)
    return o, d, t, total_prod


def _furness(o, d, t, idx, nodes, target_A, iters):
    """Doubly-constrain to the attraction targets (productions already met)."""
    node_to_k = {int(n): k for k, n in enumerate(nodes)}
    dk = np.array([node_to_k[int(x)] for x in d], dtype=np.int64)
    for _ in range(iters):
        col = np.zeros(len(nodes))
        np.add.at(col, dk, t)
        scale = np.where(col > 0, target_A / np.maximum(col, 1e-9), 1.0)
        # normalise attraction scale to preserve total
        scale *= target_A.sum() / max(np.dot(scale, col), 1e-9)
        t = t * scale[dk]
    return t.astype(np.float32)


def all_ones_demand(zones: Zones):
    """Test demand: one trip between every ordered pair of routable zone nodes."""
    idx = np.nonzero(zones.routable)[0]
    nodes = zones.node[idx]
    nodes = nodes[nodes >= 0]
    o, d = np.meshgrid(nodes, nodes)
    mask = o != d
    o, d = o[mask], d[mask]
    t = np.ones(o.shape[0], dtype=np.float32)
    return o.astype(np.int64), d.astype(np.int64), t
