"""Tiny embedded network used only to boot/smoke-test the end-to-end slice.

This is NOT a STEAM dataset and makes no attempt to be realistic — it is a
hand-built grid of a few links and zones so the engine, server, front end and
copilot all have something to render and exercise before the real shapefile /
land-use / OD files are attached. The real loaders in :mod:`steam.data` are the
production path; this just unblocks development.
"""
from __future__ import annotations

import numpy as np

from .network import Network, CLASS_INDEX
from .zones import Zones
from .matrix import ODMatrix
from ..config import Params


def demo_network(params: Params | None = None) -> Network:
    params = params or Params()
    # 3x3 node grid at 1 km spacing, metre coords
    coords = {}
    nid = 1
    for j in range(3):
        for i in range(3):
            coords[nid] = (i * 1000.0, j * 1000.0)
            nid += 1

    def node_id(i, j):
        return j * 3 + i + 1

    links = []  # (oid, a, b, class, lanes)
    oid = 1
    # horizontal + vertical grid edges; outer ring arterial, inner collector
    for j in range(3):
        for i in range(3):
            if i < 2:
                cls = "art" if j in (0, 2) else "coll"
                links.append((oid, node_id(i, j), node_id(i + 1, j), cls, 2)); oid += 1
            if j < 2:
                cls = "art" if i in (0, 2) else "coll"
                links.append((oid, node_id(i, j), node_id(i, j + 1), cls, 2)); oid += 1
    # one freeway diagonal-ish (corner to corner via center)
    links.append((oid, node_id(0, 0), node_id(1, 1), "fwy", 3)); oid += 1
    links.append((oid, node_id(1, 1), node_id(2, 2), "fwy", 3)); oid += 1

    rows, geom = [], []
    for (o, a, b, cls, lanes) in links:
        xa, ya = coords[a]
        xb, yb = coords[b]
        length = float(np.hypot(xb - xa, yb - ya))
        rows.append({"OBJECTID": o, "A": a, "B": b, "class": cls,
                     "LANE_2040": lanes, "SHAPE_Leng": length, "oneway": False})
        geom.append(np.array([[xa, ya], [xb, yb]], dtype=np.float32))

    from .network import _build
    return _build(rows, geom, params)


def demo_zones() -> Zones:
    # one zone near each grid node, population/jobs varied
    n = 9
    cx = np.array([(k % 3) * 1000.0 for k in range(n)], dtype=np.float32)
    cy = np.array([(k // 3) * 1000.0 for k in range(n)], dtype=np.float32)
    pop = np.array([500, 800, 600, 700, 1200, 900, 400, 1000, 750], dtype=np.float32)
    wkr = np.array([300, 200, 900, 250, 1500, 400, 150, 350, 1100], dtype=np.float32)
    z = np.arange(1, n + 1, dtype=np.int64)
    zeros = np.zeros(n, dtype=np.float32)
    return Zones(
        z=z, district=np.array([1, 1, 2, 1, 1, 2, 3, 3, 2], dtype=np.int64),
        distname=[f"D{d}" for d in [1, 1, 2, 1, 1, 2, 3, 3, 2]],
        areatype=np.ones(n, dtype=np.int64),
        urban_rura=np.ones(n, dtype=np.int64),
        metro_access=np.zeros(n, dtype=np.int64),
        reg=np.ones(n, dtype=np.int64),
        lu_class=np.ones(n, dtype=np.int64),
        shapearea=np.ones(n, dtype=np.float32),
        pop=pop, hh=pop / 3.0, worker=wkr, student=pop / 5.0,
        retail_gfa=wkr * 2, office_gfa=wkr * 3, ind_gfa=wkr,
        school_gfa=pop / 5.0,
        centroid=np.column_stack([cx, cy]).astype(np.float32),
        routable=np.ones(n, dtype=bool),
    )


def demo_matrix() -> ODMatrix:
    o, d, t = [], [], []
    rng_pairs = [(1, 5, 1200), (5, 9, 900), (3, 7, 800), (9, 1, 1100),
                 (2, 8, 600), (4, 6, 500), (1, 9, 700), (7, 3, 650)]
    for a, b, trips in rng_pairs:
        o.append(a); d.append(b); t.append(float(trips))
    return ODMatrix(np.array(o, dtype=np.int64), np.array(d, dtype=np.int64),
                    np.array(t, dtype=np.float32))
