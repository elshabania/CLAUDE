"""Hot-loop kernels: Dijkstra shortest paths + origin tree loading.

These are written in plain NumPy/Python but decorated so that, *when Numba is
installed*, they JIT-compile to multi-threaded native code (spec section 1A).
When Numba is absent the same functions run as pure Python — slower, but the
air-gapped slice still works and results are bit-for-bit identical.

The Dijkstra uses a binary heap over the CSR adjacency. ``load_tree`` walks the
predecessor-edge array back from every destination to its origin, depositing
trips onto links — the all-or-nothing assignment of one origin.
"""
from __future__ import annotations

import numpy as np

try:  # optional JIT
    from numba import njit, prange
    _HAVE_NUMBA = True
except Exception:  # pragma: no cover - exercised only without numba
    _HAVE_NUMBA = False

    def njit(*args, **kw):
        # support both @njit and @njit(cache=True)
        if len(args) == 1 and callable(args[0]) and not kw:
            return args[0]

        def wrap(fn):
            return fn
        return wrap

    prange = range


INF = np.float32(1e30)


@njit(cache=True)
def dijkstra(indptr, head, weight, source, n_nodes):
    """Single-source Dijkstra. Returns (dist, pred_edge).

    pred_edge[v] = index of the edge used to reach v on the shortest path
    (-1 for the source and unreached nodes).
    """
    dist = np.full(n_nodes, INF, dtype=np.float32)
    pred_edge = np.full(n_nodes, -1, dtype=np.int64)
    visited = np.zeros(n_nodes, dtype=np.uint8)
    dist[source] = 0.0

    # binary min-heap of (dist, node) kept in parallel arrays
    heap_d = np.empty(n_nodes + 1, dtype=np.float32)
    heap_n = np.empty(n_nodes + 1, dtype=np.int64)
    size = 0
    heap_d[0] = 0.0
    heap_n[0] = source
    size = 1

    while size > 0:
        # pop min
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
            sm = i
            if l < size and heap_d[l] < heap_d[sm]:
                sm = l
            if r < size and heap_d[r] < heap_d[sm]:
                sm = r
            if sm == i:
                break
            heap_d[i], heap_d[sm] = heap_d[sm], heap_d[i]
            heap_n[i], heap_n[sm] = heap_n[sm], heap_n[i]
            i = sm

        if visited[u]:
            continue
        visited[u] = 1

        for e in range(indptr[u], indptr[u + 1]):
            v = head[e]
            if visited[v]:
                continue
            nd = d + weight[e]
            if nd < dist[v]:
                dist[v] = nd
                pred_edge[v] = e
                # push (nd, v)
                heap_d[size] = nd
                heap_n[size] = v
                j = size
                size += 1
                while j > 0:
                    p = (j - 1) // 2
                    if heap_d[p] <= heap_d[j]:
                        break
                    heap_d[p], heap_d[j] = heap_d[j], heap_d[p]
                    heap_n[p], heap_n[j] = heap_n[j], heap_n[p]
                    j = p
    return dist, pred_edge


@njit(cache=True)
def load_tree(pred_edge, edge_link, edge_tail, dest_nodes, dest_trips,
              source_node, link_flow):
    """Deposit each (dest, trips) onto links along the shortest path back to
    ``source_node``. Accumulates into ``link_flow`` in place (caller zeroes it
    or accumulates across origins). ``edge_tail[e]`` is the source node of edge
    ``e`` (see :func:`edge_tails_from_csr`)."""
    for k in range(dest_nodes.shape[0]):
        v = dest_nodes[k]
        t = dest_trips[k]
        if t <= 0.0:
            continue
        guard = 0
        while v != source_node and pred_edge[v] >= 0:
            e = pred_edge[v]
            link_flow[edge_link[e]] += t
            v = edge_tail[e]   # step back to the edge's tail node
            guard += 1
            if guard > 1_000_000:
                break


def edge_tails_from_csr(indptr: np.ndarray, n_edges: int) -> np.ndarray:
    """Reconstruct the tail (source) node of every CSR edge from indptr."""
    tails = np.zeros(n_edges, dtype=np.int64)
    for u in range(indptr.shape[0] - 1):
        for e in range(indptr[u], indptr[u + 1]):
            tails[e] = u
    return tails


def have_numba() -> bool:
    return _HAVE_NUMBA
