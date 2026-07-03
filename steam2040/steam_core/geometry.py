"""Segment-intersection and a uniform spatial grid.

Used by the aggregation engine to test whether the straight line between two
zone centroids crosses a barrier road, and to connect zones to the nearest
network node.  Segment crossing is the classic orientation test; the grid keeps
the crossing query near O(1) by only checking barrier segments in the cells the
query line passes through.
"""

from __future__ import annotations

import numpy as np


def segments_cross(p1, p2, p3, p4) -> bool:
    """True if segment p1-p2 properly intersects segment p3-p4."""
    d1 = _orient(p3, p4, p1)
    d2 = _orient(p3, p4, p2)
    d3 = _orient(p1, p2, p3)
    d4 = _orient(p1, p2, p4)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)):
        return True
    return False


def _orient(a, b, c) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


class SegmentGrid:
    """Uniform grid bucketing barrier segments for fast crossing queries."""

    def __init__(self, seg_a: np.ndarray, seg_b: np.ndarray, cell: float):
        """``seg_a``/``seg_b`` are (M,2) endpoints of M barrier segments."""
        self.seg_a = np.asarray(seg_a, dtype=np.float64)
        self.seg_b = np.asarray(seg_b, dtype=np.float64)
        self.cell = float(cell)
        if len(self.seg_a) == 0:
            self.minx = self.miny = 0.0
            self.buckets: dict[tuple[int, int], list[int]] = {}
            return
        allpts = np.vstack([self.seg_a, self.seg_b])
        self.minx = float(allpts[:, 0].min())
        self.miny = float(allpts[:, 1].min())
        self.buckets = {}
        for i in range(len(self.seg_a)):
            for key in self._cells_on_segment(self.seg_a[i], self.seg_b[i]):
                self.buckets.setdefault(key, []).append(i)

    def _cell_of(self, x: float, y: float) -> tuple[int, int]:
        return (int((x - self.minx) // self.cell), int((y - self.miny) // self.cell))

    def _cells_on_segment(self, a, b):
        """All grid cells a segment touches (supercover-ish via sampling)."""
        ca = self._cell_of(a[0], a[1])
        cb = self._cell_of(b[0], b[1])
        cells = {ca, cb}
        steps = max(abs(cb[0] - ca[0]), abs(cb[1] - ca[1]))
        if steps:
            for s in range(1, steps + 1):
                t = s / steps
                x = a[0] + (b[0] - a[0]) * t
                y = a[1] + (b[1] - a[1]) * t
                cells.add(self._cell_of(x, y))
        return cells

    def crosses_barrier(self, p1, p2) -> bool:
        """True if segment p1-p2 crosses any stored barrier segment."""
        if not self.buckets:
            return False
        candidates: set[int] = set()
        for key in self._cells_on_segment(np.asarray(p1, float),
                                           np.asarray(p2, float)):
            bucket = self.buckets.get(key)
            if bucket:
                candidates.update(bucket)
        for i in candidates:
            if segments_cross(p1, p2, self.seg_a[i], self.seg_b[i]):
                return True
        return False


def nearest_node_map(points: np.ndarray, node_xy: np.ndarray) -> np.ndarray:
    """For each point return the index of the nearest node (KD-tree)."""
    from scipy.spatial import cKDTree

    tree = cKDTree(node_xy)
    _, idx = tree.query(points, k=1)
    return np.asarray(idx, dtype=np.int64)
