"""Zone aggregation engine (Part 3 core).

Agglomerative merge of zones into a coarser system under two hard contiguity
rules:

* never merge across a **barrier road** (class threshold user-selectable), and
* never merge centroids more than a **maximum span** apart.

Two strategies share the same candidate generation and filters:

* ``"single"`` — single-linkage union-find over pre-filtered pairs (every merge
  edge is itself barrier- and span-valid, so the merge-edge audit is clean), and
* ``"dynamic"`` — a nearest-neighbour heap that recomputes cluster centroids and
  re-tests the barrier/span against the *cluster* centroids on each merge,
  preventing long chains.
"""

from __future__ import annotations

import csv
import heapq
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from steam_core.classify import barrier_classes_for
from steam_core.landuse import Zones
from steam_core.network import Network
from steam_core.matrix import ODMatrix
from steam_core.settings import Settings
from steam_core.geometry import SegmentGrid

# Available homogeneity keys -> the Zones attribute that must match.
HOMOGENEITY_KEYS = {
    "district": "district",
    "reg": "reg",
    "areatype": "areatype",
    "urban_rura": "urban_rura",
    "metro_access": "metro_access",
    "lu_class": "lu_class",
}


@dataclass
class AggregationConfig:
    barrier_threshold: str = "coll"        # fwy | art | coll
    max_span_m: float = 6000.0
    target_zone_count: int = 1800
    max_cluster_size: int = 0              # 0 => uncapped
    keys: tuple = ("district",)            # homogeneity keys that apply
    method: str = "single"                 # single | dynamic
    pinned_zone_ids: tuple = ()            # never-merge zone ids
    area_zone_ids: tuple | None = None     # study-area subset (None => all)

    @classmethod
    def from_settings(cls, s: Settings, **over) -> "AggregationConfig":
        base = cls(barrier_threshold=s.barrier_threshold, max_span_m=s.max_span_m,
                   target_zone_count=s.target_zone_count,
                   max_cluster_size=s.max_cluster_size)
        for k, v in over.items():
            setattr(base, k, v)
        return base


@dataclass
class AggregationResult:
    labels: np.ndarray                     # cluster id per zone row (-1 if no centroid)
    n_clusters: int
    merge_edges: list = field(default_factory=list)   # (row_i, row_j, dist)
    cluster_centroid: dict = field(default_factory=dict)  # cluster id -> (x,y)
    cluster_size: dict = field(default_factory=dict)
    active_rows: np.ndarray = None

    def correspondence(self, zones: Zones) -> list[tuple[int, int]]:
        out = []
        for row, lab in enumerate(self.labels):
            if lab >= 0:
                out.append((int(zones.z[row]), int(lab)))
        return out


def homogeneity_keys(zones: Zones, keys) -> np.ndarray:
    """Composite integer homogeneity key per zone row from the selected keys."""
    if not keys:
        return np.zeros(zones.n, dtype=np.int64)
    cols = [getattr(zones, HOMOGENEITY_KEYS[k]).astype(np.int64) for k in keys]
    # Pack into a single key by hashing the tuple deterministically.
    key = np.zeros(zones.n, dtype=np.int64)
    for c in cols:
        key = key * 1000003 + (c + 1)
    return key


def build_barrier_grid(net: Network, threshold: str, cell: float = 2000.0) -> SegmentGrid:
    """Spatial grid of every barrier-class link segment."""
    barrier_codes = barrier_classes_for(threshold)
    seg_a, seg_b = [], []
    for i in range(net.n_links):
        if int(net.klass[i]) not in barrier_codes:
            continue
        poly = net.link_polyline(i)
        for s in range(len(poly) - 1):
            seg_a.append(poly[s])
            seg_b.append(poly[s + 1])
    seg_a = np.asarray(seg_a, dtype=np.float64) if seg_a else np.empty((0, 2))
    seg_b = np.asarray(seg_b, dtype=np.float64) if seg_b else np.empty((0, 2))
    return SegmentGrid(seg_a, seg_b, cell)


class _UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, a):
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return ra
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1
        return ra


def _candidate_pairs(centroids: np.ndarray, rows: np.ndarray, max_span: float):
    """All (row_i, row_j, dist) pairs within max_span (KD-tree)."""
    from scipy.spatial import cKDTree

    pts = centroids[rows]
    tree = cKDTree(pts)
    pairs = tree.query_pairs(max_span, output_type="ndarray")
    if len(pairs) == 0:
        return np.empty((0, 3))
    d = np.hypot(pts[pairs[:, 0], 0] - pts[pairs[:, 1], 0],
                 pts[pairs[:, 0], 1] - pts[pairs[:, 1], 1])
    out = np.column_stack([rows[pairs[:, 0]], rows[pairs[:, 1]], d])
    return out[np.argsort(out[:, 2])]


def aggregate(zones: Zones, net: Network, config: AggregationConfig) -> AggregationResult:
    """Run the agglomerative merge and return the clustering."""
    centroids = zones.centroids()
    valid = ~((centroids[:, 0] == 0.0) & (centroids[:, 1] == 0.0))

    # Active set: internal/valid zones, optionally restricted to a study area,
    # minus pinned zones.
    active = valid.copy()
    if config.area_zone_ids is not None:
        area = np.isin(zones.z, np.asarray(config.area_zone_ids))
        active &= area
    if config.pinned_zone_ids:
        active &= ~np.isin(zones.z, np.asarray(config.pinned_zone_ids))
    active_rows = np.where(active)[0]

    keys = homogeneity_keys(zones, config.keys)
    grid = build_barrier_grid(net, config.barrier_threshold)
    pairs = _candidate_pairs(centroids, active_rows, config.max_span_m)

    if config.method == "dynamic":
        result = _aggregate_dynamic(zones, centroids, keys, grid, pairs,
                                    active_rows, config)
    else:
        result = _aggregate_single(zones, centroids, keys, grid, pairs,
                                   active_rows, config)
    result.active_rows = active_rows
    return result


def _filter_pair(centroids, keys, grid, i, j) -> bool:
    """True if zones i,j may merge (homogeneity + barrier)."""
    if keys[i] != keys[j]:
        return False
    if grid.crosses_barrier(centroids[i], centroids[j]):
        return False
    return True


def _finalise(zones, centroids, labels_root, active_rows) -> AggregationResult:
    # Renumber roots to dense cluster ids 0..K-1; non-active valid zones each
    # become their own cluster too.
    valid = ~((centroids[:, 0] == 0.0) & (centroids[:, 1] == 0.0))
    labels = np.full(zones.n, -1, dtype=np.int64)
    next_id = 0
    root_to_id: dict[int, int] = {}
    members: dict[int, list[int]] = {}
    for row in range(zones.n):
        if not valid[row]:
            continue
        root = labels_root.get(row, row)
        if root not in root_to_id:
            root_to_id[root] = next_id
            next_id += 1
        cid = root_to_id[root]
        labels[row] = cid
        members.setdefault(cid, []).append(row)

    cluster_centroid, cluster_size = {}, {}
    for cid, rows in members.items():
        pts = centroids[rows]
        cluster_centroid[cid] = (float(pts[:, 0].mean()), float(pts[:, 1].mean()))
        cluster_size[cid] = len(rows)
    return AggregationResult(labels=labels, n_clusters=len(members),
                             cluster_centroid=cluster_centroid,
                             cluster_size=cluster_size)


def _aggregate_single(zones, centroids, keys, grid, pairs, active_rows, config):
    uf = _UnionFind(zones.n)
    size = {int(r): 1 for r in active_rows}
    n_clusters = len(active_rows)
    target = max(1, config.target_zone_count)
    cap = config.max_cluster_size
    merge_edges = []

    for i, j, dist in pairs:
        if n_clusters <= target:
            break
        i, j = int(i), int(j)
        ri, rj = uf.find(i), uf.find(j)
        if ri == rj:
            continue
        if not _filter_pair(centroids, keys, grid, i, j):
            continue
        if cap and size.get(ri, 1) + size.get(rj, 1) > cap:
            continue
        new_root = uf.union(ri, rj)
        size[new_root] = size.get(ri, 1) + size.get(rj, 1)
        merge_edges.append((i, j, float(dist)))
        n_clusters -= 1

    labels_root = {int(r): uf.find(int(r)) for r in active_rows}
    res = _finalise(zones, centroids, labels_root, active_rows)
    res.merge_edges = merge_edges
    return res


def _aggregate_dynamic(zones, centroids, keys, grid, pairs, active_rows, config):
    """Nearest-neighbour heap with cluster-centroid re-tests."""
    uf = _UnionFind(zones.n)
    # Mutable cluster centroid (running mean) and size keyed by root.
    cx = {int(r): float(centroids[r, 0]) for r in active_rows}
    cy = {int(r): float(centroids[r, 1]) for r in active_rows}
    size = {int(r): 1 for r in active_rows}
    n_clusters = len(active_rows)
    target = max(1, config.target_zone_count)
    cap = config.max_cluster_size
    merge_edges = []

    heap = [(float(d), int(i), int(j)) for i, j, d in pairs]
    heapq.heapify(heap)

    while heap and n_clusters > target:
        d, i, j = heapq.heappop(heap)
        ri, rj = uf.find(i), uf.find(j)
        if ri == rj:
            continue
        # Re-test span and barrier against CURRENT cluster centroids.
        p_i = (cx[ri], cy[ri])
        p_j = (cx[rj], cy[rj])
        cur_d = float(np.hypot(p_i[0] - p_j[0], p_i[1] - p_j[1]))
        if cur_d > config.max_span_m:
            continue
        if keys[i] != keys[j] or grid.crosses_barrier(p_i, p_j):
            continue
        if cap and size[ri] + size[rj] > cap:
            continue
        # Merge; update running centroid.
        sa, sb = size[ri], size[rj]
        new_root = uf.union(ri, rj)
        other = rj if new_root == ri else ri
        tot = sa + sb
        cx[new_root] = (cx[ri] * sa + cx[rj] * sb) / tot
        cy[new_root] = (cy[ri] * sa + cy[rj] * sb) / tot
        size[new_root] = tot
        size.pop(other, None)
        merge_edges.append((i, j, cur_d))
        n_clusters -= 1

    labels_root = {int(r): uf.find(int(r)) for r in active_rows}
    res = _finalise(zones, centroids, labels_root, active_rows)
    res.merge_edges = merge_edges
    return res


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

def aggregate_od(od: ODMatrix, zones: Zones, result: AggregationResult) -> ODMatrix:
    """Collapse a long OD matrix to the new zoning by summing cells."""
    z2new = {int(zones.z[r]): int(result.labels[r]) for r in range(zones.n)
             if result.labels[r] >= 0}
    acc: dict[tuple[int, int], float] = {}
    for o, d, t in zip(od.origin, od.dest, od.trips):
        no = z2new.get(int(o))
        nd = z2new.get(int(d))
        if no is None or nd is None:
            continue
        acc[(no, nd)] = acc.get((no, nd), 0.0) + float(t)
    if not acc:
        return ODMatrix(np.empty(0, np.int64), np.empty(0, np.int64), np.empty(0))
    keys = np.array(list(acc.keys()), dtype=np.int64)
    vals = np.array(list(acc.values()), dtype=np.float64)
    return ODMatrix(keys[:, 0], keys[:, 1], vals)


def write_correspondence(path, zones: Zones, result: AggregationResult) -> None:
    with open(path, "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["old_zone", "new_zone"])
        for old, new in result.correspondence(zones):
            wr.writerow([old, new])


def write_geojson(path, zones: Zones, result: AggregationResult) -> None:
    """Export new clusters as polygons (convex hull of member centroids)."""
    from scipy.spatial import ConvexHull, QhullError

    centroids = zones.centroids()
    members: dict[int, list[int]] = {}
    for row, lab in enumerate(result.labels):
        if lab >= 0:
            members.setdefault(int(lab), []).append(row)

    features = []
    for cid, rows in members.items():
        pts = centroids[rows]
        if len(pts) >= 3:
            try:
                hull = ConvexHull(pts)
                ring = pts[hull.vertices]
            except (QhullError, ValueError):
                ring = pts
        else:
            ring = pts
        coords = [[float(x), float(y)] for x, y in ring]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        geom = ({"type": "Polygon", "coordinates": [coords]} if len(coords) >= 4
                else {"type": "MultiPoint", "coordinates": coords})
        features.append({
            "type": "Feature",
            "properties": {"new_zone": cid, "n_zones": len(rows)},
            "geometry": geom,
        })
    Path(path).write_text(json.dumps(
        {"type": "FeatureCollection", "features": features}))


def qa_flags(zones: Zones, net: Network, result: AggregationResult,
             config: AggregationConfig) -> dict:
    """Audit: non-contiguous clusters and clusters spanning a barrier."""
    centroids = zones.centroids()
    grid = build_barrier_grid(net, config.barrier_threshold)
    members: dict[int, list[int]] = {}
    for row, lab in enumerate(result.labels):
        if lab >= 0:
            members.setdefault(int(lab), []).append(row)

    non_contig, barrier_span = [], []
    for cid, rows in members.items():
        if len(rows) < 2:
            continue
        pts = centroids[rows]
        # Contiguity: members connected via allowed (in-span, no-barrier) edges.
        from scipy.spatial import cKDTree
        tree = cKDTree(pts)
        pairs = tree.query_pairs(config.max_span_m, output_type="ndarray")
        uf = _UnionFind(len(rows))
        spans = False
        for a, b in pairs:
            if not grid.crosses_barrier(pts[a], pts[b]):
                uf.union(int(a), int(b))
        roots = {uf.find(k) for k in range(len(rows))}
        if len(roots) > 1:
            non_contig.append(cid)
        # Barrier span: any member-pair line crosses a barrier.
        for a in range(len(rows)):
            for b in range(a + 1, len(rows)):
                if grid.crosses_barrier(pts[a], pts[b]):
                    spans = True
                    break
            if spans:
                break
        if spans:
            barrier_span.append(cid)

    return {
        "non_contiguous_clusters": non_contig,
        "barrier_spanning_clusters": barrier_span,
        "n_non_contiguous": len(non_contig),
        "n_barrier_spanning": len(barrier_span),
    }


def aggregation_stats(zones: Zones, result: AggregationResult) -> dict:
    sizes = np.array(list(result.cluster_size.values())) if result.cluster_size else np.array([0])
    return {
        "zones_in": int((result.labels >= 0).sum()),
        "clusters_out": int(result.n_clusters),
        "mean_cluster_size": float(sizes.mean()),
        "max_cluster_size": int(sizes.max()),
        "merge_steps": len(result.merge_edges),
    }
