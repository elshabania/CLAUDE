"""Compressed-sparse-row (CSR) routing graph built from a :class:`Network`.

One directed edge per link direction (two for a two-way link, one for a
one-way link).  The CSR layout — ``indptr``/``indices``/``weight`` plus the
``edge_link`` back-pointer — is what the Numba Dijkstra + tree-load kernels
consume.  ``link_volume_from_edges`` folds directed edge flow back onto links.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .network import Network


@dataclass
class CSRGraph:
    n_nodes: int
    indptr: np.ndarray       # (N+1,) int64 — head[node]
    indices: np.ndarray      # (E,) int32  — to-node of each edge
    weight: np.ndarray       # (E,) float64 — congested time, mutable
    edge_link: np.ndarray    # (E,) int32  — link index each edge belongs to
    n_links: int

    @property
    def n_edges(self) -> int:
        return len(self.indices)

    def link_volume_from_edges(self, edge_flow: np.ndarray) -> np.ndarray:
        """Sum directed edge flow onto undirected link volume."""
        vol = np.zeros(self.n_links, dtype=np.float64)
        np.add.at(vol, self.edge_link, edge_flow)
        return vol

    def set_weights_from_link_time(self, link_time: np.ndarray) -> None:
        """Broadcast a per-link travel time onto every directed edge."""
        self.weight = link_time[self.edge_link].astype(np.float64)


def build_csr(net: Network) -> CSRGraph:
    n = net.n_links
    twoway = ~net.oneway
    n_edges = n + int(twoway.sum())

    src = np.empty(n_edges, dtype=np.int64)
    dst = np.empty(n_edges, dtype=np.int32)
    elink = np.empty(n_edges, dtype=np.int32)

    # Forward edges for every link.
    src[:n] = net.node_a
    dst[:n] = net.node_b
    elink[:n] = np.arange(n, dtype=np.int32)

    # Backward edges only for two-way links.
    back = np.where(twoway)[0]
    src[n:] = net.node_b[back]
    dst[n:] = net.node_a[back]
    elink[n:] = back.astype(np.int32)

    # Sort edges by source node to lay out CSR.
    order = np.argsort(src, kind="stable")
    src = src[order]
    dst = dst[order]
    elink = elink[order]

    indptr = np.zeros(net.n_nodes + 1, dtype=np.int64)
    np.add.at(indptr, src + 1, 1)
    np.cumsum(indptr, out=indptr)

    weight = net.fftime[elink].astype(np.float64)
    return CSRGraph(
        n_nodes=net.n_nodes, indptr=indptr, indices=dst, weight=weight,
        edge_link=elink, n_links=n,
    )
