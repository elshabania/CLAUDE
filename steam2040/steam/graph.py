"""CSR directed graph built from a :class:`~steam.data.network.Network`.

One link becomes one edge A->B, plus a reverse edge B->A unless the link is
one-way. The CSR layout (``indptr``/``head``) lets the Numba Dijkstra kernel
walk a node's out-edges with no Python-object overhead.

Arrays:
    indptr[node]      : start offset of node's out-edges in the edge arrays
    head[edge]        : destination node index of the edge
    weight[edge]      : current edge cost (seconds); rewritten each iteration
    edge_link[edge]   : index of the source link in the Network
    node_ids/node_xy  : id and metre coordinate per node index
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .data.network import Network


@dataclass
class CSRGraph:
    n_nodes: int
    indptr: np.ndarray       # int64 (n_nodes+1,)
    head: np.ndarray         # int64 (n_edges,)
    weight: np.ndarray       # float32 (n_edges,) mutable travel time
    edge_link: np.ndarray    # int64 (n_edges,) edge -> source link index
    node_ids: np.ndarray     # int64 (n_nodes,)
    node_xy: np.ndarray      # float32 (n_nodes,2)

    @property
    def n_edges(self) -> int:
        return int(self.head.shape[0])


def _node_coords(net: Network, id_to_idx: dict, n_nodes: int) -> np.ndarray:
    """Approximate each node's coordinate from incident link endpoints."""
    xy = np.zeros((n_nodes, 2), dtype=np.float32)
    seen = np.zeros(n_nodes, dtype=bool)
    for li in range(net.n_links):
        g = net.geometry[li]
        if g.shape[0] == 0:
            continue
        ai = id_to_idx[int(net.a[li])]
        bi = id_to_idx[int(net.b[li])]
        if not seen[ai]:
            xy[ai] = g[0]
            seen[ai] = True
        if not seen[bi]:
            xy[bi] = g[-1]
            seen[bi] = True
    return xy


def build_csr(net: Network) -> CSRGraph:
    # 1. unique node ids -> dense index
    node_ids = np.unique(np.concatenate([net.a, net.b]))
    id_to_idx = {int(v): i for i, v in enumerate(node_ids)}
    n_nodes = node_ids.shape[0]

    ai = np.fromiter((id_to_idx[int(v)] for v in net.a), dtype=np.int64, count=net.n_links)
    bi = np.fromiter((id_to_idx[int(v)] for v in net.b), dtype=np.int64, count=net.n_links)

    # 2. directed edge list: forward always, reverse unless one-way
    rev_mask = ~net.oneway
    src = np.concatenate([ai, bi[rev_mask]])
    dst = np.concatenate([bi, ai[rev_mask]])
    elink = np.concatenate([np.arange(net.n_links), np.nonzero(rev_mask)[0]])
    w = np.concatenate([net.free_flow_time_s, net.free_flow_time_s[rev_mask]]).astype(np.float32)

    # 3. sort by source node to form CSR
    order = np.argsort(src, kind="stable")
    src, dst, elink, w = src[order], dst[order], elink[order], w[order]
    indptr = np.zeros(n_nodes + 1, dtype=np.int64)
    np.add.at(indptr, src + 1, 1)
    np.cumsum(indptr, out=indptr)

    node_xy = _node_coords(net, id_to_idx, n_nodes)

    # store node bookkeeping back on the network for downstream use
    net.node_ids = node_ids
    net.node_xy = node_xy

    return CSRGraph(
        n_nodes=int(n_nodes),
        indptr=indptr,
        head=dst.astype(np.int64),
        weight=w,
        edge_link=elink.astype(np.int64),
        node_ids=node_ids,
        node_xy=node_xy,
    )


def connect_zones(graph: CSRGraph, zone_centroids: np.ndarray) -> np.ndarray:
    """Nearest-network-node connector for each zone centroid (KD-tree).

    Returns an int64 array (n_zones,) of node *indices*. Zones with a degenerate
    centroid (0,0) map to -1 and are treated as not connected.
    """
    from scipy.spatial import cKDTree
    tree = cKDTree(graph.node_xy)
    valid = ~np.all(zone_centroids == 0, axis=1)
    nodes = np.full(zone_centroids.shape[0], -1, dtype=np.int64)
    if valid.any():
        _, idx = tree.query(zone_centroids[valid])
        nodes[valid] = idx.astype(np.int64)
    return nodes
