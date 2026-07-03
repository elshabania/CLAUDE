"""Shortest-path + tree-load kernels.

These are the hot loops.  They are written in a Numba-friendly style (scalar
loops, preallocated arrays, no Python objects) and compiled with ``@njit`` when
Numba is available; otherwise the very same functions run as pure Python so the
engine still works on an environment without Numba (just slower).

All functions take raw NumPy arrays — never the :class:`~steam_core.graph.CSRGraph`
object — so they can cross the Numba boundary.
"""

from __future__ import annotations

import numpy as np

try:  # optional acceleration
    from numba import njit
    HAVE_NUMBA = True
except Exception:  # pragma: no cover - exercised only without numba
    HAVE_NUMBA = False

    def njit(*args, **kwargs):
        def wrap(fn):
            return fn
        # support both @njit and @njit(cache=True)
        if args and callable(args[0]):
            return args[0]
        return wrap


INF = np.inf


@njit(cache=True)
def _dijkstra(indptr, indices, weight, source, dist, parent_edge, parent_node,
              heap_d, heap_n):
    """Single-source Dijkstra with a lazy-deletion binary heap.

    Fills ``dist`` (seconds), ``parent_edge`` and ``parent_node`` (both -1 where
    unreached).  Heap arrays must hold at least ``n_edges`` entries.
    """
    n = dist.shape[0]
    for i in range(n):
        dist[i] = INF
        parent_edge[i] = -1
        parent_node[i] = -1
    dist[source] = 0.0
    heap_d[0] = 0.0
    heap_n[0] = source
    size = 1

    while size > 0:
        d = heap_d[0]
        u = heap_n[0]
        size -= 1
        heap_d[0] = heap_d[size]
        heap_n[0] = heap_n[size]
        # sift down
        i = 0
        while True:
            l = 2 * i + 1
            r = 2 * i + 2
            small = i
            if l < size and heap_d[l] < heap_d[small]:
                small = l
            if r < size and heap_d[r] < heap_d[small]:
                small = r
            if small == i:
                break
            heap_d[i], heap_d[small] = heap_d[small], heap_d[i]
            heap_n[i], heap_n[small] = heap_n[small], heap_n[i]
            i = small

        if d > dist[u]:
            continue
        for e in range(indptr[u], indptr[u + 1]):
            v = indices[e]
            nd = d + weight[e]
            if nd < dist[v]:
                dist[v] = nd
                parent_edge[v] = e
                parent_node[v] = u
                # push (nd, v)
                j = size
                heap_d[j] = nd
                heap_n[j] = v
                size += 1
                while j > 0:
                    p = (j - 1) // 2
                    if heap_d[p] <= heap_d[j]:
                        break
                    heap_d[p], heap_d[j] = heap_d[j], heap_d[p]
                    heap_n[p], heap_n[j] = heap_n[j], heap_n[p]
                    j = p


@njit(cache=True)
def _load_tree(parent_edge, parent_node, source, dest_nodes, dest_trips,
               edge_flow):
    """Add each (dest, trips) onto edges of the shortest-path tree to source."""
    m = dest_nodes.shape[0]
    for k in range(m):
        d = dest_nodes[k]
        t = dest_trips[k]
        if t <= 0.0 or d == source or parent_edge[d] < 0:
            continue
        u = d
        while u != source:
            e = parent_edge[u]
            if e < 0:
                break
            edge_flow[e] += t
            u = parent_node[u]


@njit(cache=True)
def aon_fixed(indptr, indices, weight, n_nodes, origins, head, dest_node,
              dest_trips):
    """All-or-nothing load of a fixed OD, grouped by origin.

    ``origins[i]`` is an origin node; its destinations are
    ``dest_node[head[i]:head[i+1]]`` with trips ``dest_trips[...]``.
    Returns ``(edge_flow, sptt)`` where SPTT = sum trips * shortest-path time.
    """
    n_edges = indices.shape[0]
    edge_flow = np.zeros(n_edges, dtype=np.float64)
    dist = np.empty(n_nodes, dtype=np.float64)
    parent_edge = np.empty(n_nodes, dtype=np.int64)
    parent_node = np.empty(n_nodes, dtype=np.int64)
    heap_d = np.empty(n_edges + 1, dtype=np.float64)
    heap_n = np.empty(n_edges + 1, dtype=np.int64)

    sptt = 0.0
    for i in range(origins.shape[0]):
        s = origins[i]
        _dijkstra(indptr, indices, weight, s, dist, parent_edge, parent_node,
                  heap_d, heap_n)
        lo = head[i]
        hi = head[i + 1]
        for k in range(lo, hi):
            d = dest_node[k]
            t = dest_trips[k]
            if t > 0.0 and d != s and dist[d] < INF:
                sptt += t * dist[d]
        _load_tree(parent_edge, parent_node, s,
                   dest_node[lo:hi], dest_trips[lo:hi], edge_flow)
    return edge_flow, sptt


@njit(cache=True)
def aon_gravity(indptr, indices, weight, n_nodes, origin_nodes, origin_prod,
                zone_nodes, zone_attr, beta):
    """All-or-nothing load of a production-constrained gravity demand.

    For each origin, destination weight = ``attr_j * exp(-beta * t_ij_minutes)``
    on the *current* skim, normalised to the origin production.  Returns
    ``(edge_flow, sptt, total_demand)``.
    """
    n_edges = indices.shape[0]
    n_zones = zone_nodes.shape[0]
    edge_flow = np.zeros(n_edges, dtype=np.float64)
    dist = np.empty(n_nodes, dtype=np.float64)
    parent_edge = np.empty(n_nodes, dtype=np.int64)
    parent_node = np.empty(n_nodes, dtype=np.int64)
    heap_d = np.empty(n_edges + 1, dtype=np.float64)
    heap_n = np.empty(n_edges + 1, dtype=np.int64)
    w = np.empty(n_zones, dtype=np.float64)
    dnode = np.empty(n_zones, dtype=np.int64)
    dtrip = np.empty(n_zones, dtype=np.float64)

    sptt = 0.0
    total_demand = 0.0
    for i in range(origin_nodes.shape[0]):
        s = origin_nodes[i]
        prod = origin_prod[i]
        if prod <= 0.0:
            continue
        _dijkstra(indptr, indices, weight, s, dist, parent_edge, parent_node,
                  heap_d, heap_n)
        wsum = 0.0
        for j in range(n_zones):
            zn = zone_nodes[j]
            if zn == s or zone_attr[j] <= 0.0 or dist[zn] >= INF:
                w[j] = 0.0
                continue
            tmin = dist[zn] / 60.0
            wj = zone_attr[j] * np.exp(-beta * tmin)
            w[j] = wj
            wsum += wj
        if wsum <= 0.0:
            continue
        m = 0
        for j in range(n_zones):
            if w[j] > 0.0:
                t = prod * w[j] / wsum
                dnode[m] = zone_nodes[j]
                dtrip[m] = t
                sptt += t * dist[zone_nodes[j]]
                total_demand += t
                m += 1
        _load_tree(parent_edge, parent_node, s, dnode[:m], dtrip[:m], edge_flow)
    return edge_flow, sptt, total_demand


def warmup() -> None:
    """Trigger Numba compilation on a tiny graph so the first real run is fast."""
    if not HAVE_NUMBA:
        return
    indptr = np.array([0, 1, 2, 2], dtype=np.int64)
    indices = np.array([1, 2], dtype=np.int32)
    weight = np.array([1.0, 1.0], dtype=np.float64)
    origins = np.array([0], dtype=np.int64)
    head = np.array([0, 1], dtype=np.int64)
    dnode = np.array([2], dtype=np.int64)
    dtrip = np.array([1.0], dtype=np.float64)
    aon_fixed(indptr, indices, weight, 3, origins, head, dnode, dtrip)
    aon_gravity(indptr, indices, weight, 3, origins, np.array([1.0]),
                np.array([1, 2], dtype=np.int64), np.array([0.0, 1.0]), 0.1)
