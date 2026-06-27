"""Zone aggregation (spec section 3.2).

Merge ~3,692 base zones down to a target count subject to:
  * homogeneity keys (same DISTRICT/REG/AREATYPE/URBAN_RURA/METRO_ACCESS/LU_CLASS),
  * span limit: centroids no more than ``max_span_m`` apart,
  * contiguity: the centroid-to-centroid line must not cross a *barrier* road
    (barrier class selectable: fwy | art | coll-and-above).

Algorithm: KD-tree candidate pairs within span -> drop barrier-crossing and
non-homogeneous pairs -> agglomerative union-find merge of the cheapest valid
pairs until the target count is reached. A uniform spatial grid accelerates the
segment-crossing test against barrier links.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from ..config import BARRIER_RANK, FACILITY_CLASSES
from ..data.network import Network
from ..data.zones import Zones

CLASS_RANK = {c: i for i, c in enumerate(FACILITY_CLASSES)}


@dataclass
class AggregationResult:
    correspondence: np.ndarray        # int64 (n_zones,) old index -> new cluster id
    n_clusters: int
    cluster_of_zone: dict             # zone id -> new cluster id
    stats: dict = field(default_factory=dict)
    qa_flags: List[dict] = field(default_factory=list)


class _BarrierIndex:
    """Uniform-grid spatial index of barrier link segments for fast crossing
    tests."""

    def __init__(self, segments: np.ndarray, cell: float = 2000.0):
        # segments: (m,4) = x0,y0,x1,y1
        self.seg = segments
        self.cell = cell
        self.grid = {}
        for i, (x0, y0, x1, y1) in enumerate(segments):
            for key in self._cells(x0, y0, x1, y1):
                self.grid.setdefault(key, []).append(i)

    def _cells(self, x0, y0, x1, y1):
        c = self.cell
        cx0, cy0 = int(x0 // c), int(y0 // c)
        cx1, cy1 = int(x1 // c), int(y1 // c)
        for cx in range(min(cx0, cx1), max(cx0, cx1) + 1):
            for cy in range(min(cy0, cy1), max(cy0, cy1) + 1):
                yield (cx, cy)

    def crosses(self, x0, y0, x1, y1) -> bool:
        seen = set()
        for key in self._cells(x0, y0, x1, y1):
            for i in self.grid.get(key, ()):
                if i in seen:
                    continue
                seen.add(i)
                sx0, sy0, sx1, sy1 = self.seg[i]
                if _segments_intersect(x0, y0, x1, y1, sx0, sy0, sx1, sy1):
                    return True
        return False


def _ccw(ax, ay, bx, by, cx, cy):
    return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax)


def _segments_intersect(ax, ay, bx, by, cx, cy, dx, dy) -> bool:
    d1 = _ccw(cx, cy, dx, dy, ax, ay)
    d2 = _ccw(cx, cy, dx, dy, bx, by)
    d3 = _ccw(ax, ay, bx, by, cx, cy)
    d4 = _ccw(ax, ay, bx, by, dx, dy)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))


def _barrier_segments(net: Network, barrier: str) -> np.ndarray:
    """Endpoint segments of every link at or above the barrier rank."""
    min_rank = BARRIER_RANK.get(barrier, 1)
    segs = []
    for li in range(net.n_links):
        cls = FACILITY_CLASSES[int(net.klass[li])]
        rank = BARRIER_RANK.get(cls, 0)
        if rank < min_rank:
            continue
        g = net.geometry[li]
        if g.shape[0] >= 2:
            segs.append((g[0, 0], g[0, 1], g[-1, 0], g[-1, 1]))
    return np.asarray(segs, dtype=np.float64) if segs else np.zeros((0, 4))


class _UnionFind:
    def __init__(self, n):
        self.p = list(range(n))
        self.size = [1] * n

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.p[rb] = ra
        self.size[ra] += self.size[rb]
        return True


def _homogeneous(zones: Zones, i, j, keys) -> bool:
    for key in keys:
        arr = getattr(zones, key, None)
        if arr is None:
            continue
        if arr[i] != arr[j]:
            return False
    return True


def aggregate(zones: Zones, net: Network, target: int,
              barrier: str = "coll", max_span_m: float = 6000.0,
              keys: Optional[List[str]] = None,
              max_cluster: int = 0) -> AggregationResult:
    keys = keys if keys is not None else ["district"]
    from scipy.spatial import cKDTree

    idx = np.nonzero(zones.routable)[0]
    cent = zones.centroid[idx]
    n = len(idx)
    uf = _UnionFind(n)

    barrier_idx = _BarrierIndex(_barrier_segments(net, barrier))

    # candidate pairs within span via KD-tree
    tree = cKDTree(cent)
    pairs = tree.query_pairs(r=max_span_m, output_type="ndarray")
    # order pairs by centroid distance (merge closest first)
    if len(pairs):
        d = np.linalg.norm(cent[pairs[:, 0]] - cent[pairs[:, 1]], axis=1)
        pairs = pairs[np.argsort(d)]

    n_clusters = n
    for a, b in pairs:
        if n_clusters <= target:
            break
        ra, rb = uf.find(a), uf.find(b)
        if ra == rb:
            continue
        gi, gj = idx[a], idx[b]
        if not _homogeneous(zones, gi, gj, keys):
            continue
        x0, y0 = cent[a]
        x1, y1 = cent[b]
        if barrier_idx.crosses(x0, y0, x1, y1):
            continue
        if max_cluster and uf.size[ra] + uf.size[rb] > max_cluster:
            continue
        if uf.union(a, b):
            n_clusters -= 1

    # relabel cluster roots to compact 1-based ids
    roots = {}
    correspondence = np.full(zones.n_zones, -1, dtype=np.int64)
    cluster_of_zone = {}
    for k in range(n):
        r = uf.find(k)
        cid = roots.setdefault(r, len(roots) + 1)
        gi = idx[k]
        correspondence[gi] = cid
        cluster_of_zone[int(zones.z[gi])] = cid

    stats = _stats(zones, idx, correspondence, uf, n_clusters, target)
    qa = _qa_flags(zones, net, idx, uf, barrier_idx, cent)
    return AggregationResult(correspondence, len(roots), cluster_of_zone,
                             stats, qa)


def _stats(zones, idx, corr, uf, n_clusters, target):
    sizes = {}
    for k in range(len(idx)):
        r = uf.find(k)
        sizes[r] = sizes.get(r, 0) + 1
    sz = np.array(list(sizes.values()))
    return {
        "zones_before": int(len(idx)),
        "zones_after": int(n_clusters),
        "target": int(target),
        "mean_cluster_size": float(sz.mean()) if sz.size else 0.0,
        "max_cluster_size": int(sz.max()) if sz.size else 0,
    }


def _qa_flags(zones, net, idx, uf, barrier_idx, cent):
    """Flag clusters whose internal spokes cross a barrier (should be none)."""
    flags = []
    # group member local-indices by root
    groups = {}
    for k in range(len(idx)):
        groups.setdefault(uf.find(k), []).append(k)
    for root, members in groups.items():
        if len(members) < 2:
            continue
        c0 = cent[members[0]]
        for m in members[1:]:
            if barrier_idx.crosses(c0[0], c0[1], cent[m][0], cent[m][1]):
                flags.append({"cluster_root": int(zones.z[idx[root]]),
                              "reason": "spoke_crosses_barrier"})
                break
    return flags
