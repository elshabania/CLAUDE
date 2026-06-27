"""Network (link) loader.

Reads the 2040 road network either from the ESRI shapefile
``v322_AD_20250606_v19`` (geometry + 109-field DBF) or from an equivalent CSV.
Only the fields listed in section 2A of the spec are used. Output is a
:class:`Network` dataclass holding parallel NumPy arrays plus polyline geometry.

Shapefile reading uses ``pyshp`` (pure-python, optional). If it is not
installed the CSV path still works, so the air-gapped build can ship without
the binary GDAL stack.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

import numpy as np

from ..config import Params, ltype_to_class, FACILITY_CLASSES

CLASS_INDEX = {c: i for i, c in enumerate(FACILITY_CLASSES)}


@dataclass
class Network:
    """In-memory road network. All per-link arrays share the link order."""

    object_id: np.ndarray            # int64  unique link id (OBJECTID)
    a: np.ndarray                    # int64  from-node id
    b: np.ndarray                    # int64  to-node id
    klass: np.ndarray                # int8   facility-class index (CLASS_INDEX)
    lanes: np.ndarray                # int16  LANE_2040
    length_m: np.ndarray             # float32 SHAPE_Leng
    oneway: np.ndarray               # bool   True if one-way A->B only
    capacity: np.ndarray             # float32 veh/h (both lanes summed)
    free_flow_time_s: np.ndarray     # float32 free-flow travel time, seconds
    geometry: List[np.ndarray]       # list of (k,2) float32 polylines, metres

    # node bookkeeping (filled by graph builder)
    node_ids: Optional[np.ndarray] = None       # int64 unique node ids
    node_xy: Optional[np.ndarray] = None         # (n,2) float32 node coords

    @property
    def n_links(self) -> int:
        return int(self.object_id.shape[0])

    @property
    def n_nodes(self) -> int:
        return 0 if self.node_ids is None else int(self.node_ids.shape[0])

    def class_name(self, i: int) -> str:
        return FACILITY_CLASSES[int(i)]

    def bounds(self):
        """(minx, miny, maxx, maxy) over all geometry, for fit-view."""
        xs = np.concatenate([g[:, 0] for g in self.geometry]) if self.geometry else np.zeros(1)
        ys = np.concatenate([g[:, 1] for g in self.geometry]) if self.geometry else np.zeros(1)
        return float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())


def _derive_capacity_and_time(klass_idx, lanes, length_m, params: Params):
    """capacity = max(1,lanes)*cap_per_lane[class]; ff_time = len / (kmh/3.6)."""
    n = len(klass_idx)
    cap = np.empty(n, dtype=np.float32)
    fft = np.empty(n, dtype=np.float32)
    for i in range(n):
        cls = FACILITY_CLASSES[int(klass_idx[i])]
        lane = max(1, int(lanes[i]))
        cap[i] = lane * params.cap_per_lane[cls]
        speed_ms = params.speed_kmh[cls] / 3.6
        fft[i] = (length_m[i] / speed_ms) if speed_ms > 0 else 0.0
    return cap, fft


def _build(rows, geometry, params: Params) -> Network:
    """rows: list of dicts already filtered to routable 2040 road links."""
    n = len(rows)
    net = Network(
        object_id=np.array([r["OBJECTID"] for r in rows], dtype=np.int64),
        a=np.array([r["A"] for r in rows], dtype=np.int64),
        b=np.array([r["B"] for r in rows], dtype=np.int64),
        klass=np.array([CLASS_INDEX[r["class"]] for r in rows], dtype=np.int8),
        lanes=np.array([r["LANE_2040"] for r in rows], dtype=np.int16),
        length_m=np.array([r["SHAPE_Leng"] for r in rows], dtype=np.float32),
        oneway=np.array([r["oneway"] for r in rows], dtype=bool),
        capacity=np.zeros(n, dtype=np.float32),
        free_flow_time_s=np.zeros(n, dtype=np.float32),
        geometry=geometry,
    )
    net.capacity, net.free_flow_time_s = _derive_capacity_and_time(
        net.klass, net.lanes, net.length_m, params)
    return net


def _num(v, default=0.0):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _accept_record(rec) -> Optional[dict]:
    """Apply the spec's 2040-road filter and field mapping to one raw record.

    Returns a normalised dict or None if the link is excluded. ``rec`` is a
    mapping of DBF/CSV field name -> value.
    """
    if _num(rec.get("LINK_2040"), 0) != 1:
        return None                      # link does not exist in 2040
    if _num(rec.get("RAIL"), 0) == 1:
        return None                      # rail link, exclude from road assign
    cls = ltype_to_class(int(_num(rec.get("LTYPE_2040"), -1)))
    if cls is None:
        return None                      # protected / non-road type
    a = int(_num(rec.get("A"), _num(rec.get("FNODE"), 0)))
    b = int(_num(rec.get("B"), _num(rec.get("TNODE"), 0)))
    if a == b or a == 0 or b == 0:
        return None
    oneway = _num(rec.get("LT40_OWAY"), 0) != 0  # presence of one-way type
    return {
        "OBJECTID": int(_num(rec.get("OBJECTID"), 0)),
        "A": a, "B": b, "class": cls,
        "LANE_2040": int(_num(rec.get("LANE_2040"), 1)),
        "SHAPE_Leng": _num(rec.get("SHAPE_Leng"), 0.0),
        "oneway": bool(oneway),
    }


def load_from_csv(path: str, params: Optional[Params] = None) -> Network:
    """Load the network from a CSV with the DBF field names as headers.

    Geometry, if present, is read from a ``WKT`` column (LINESTRING in metre
    coords); otherwise links get a straight two-point line from node coords if
    available, else an empty placeholder.
    """
    params = params or Params()
    rows, geom = [], []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        for rec in reader:
            norm = _accept_record(rec)
            if norm is None:
                continue
            rows.append(norm)
            geom.append(_parse_wkt(rec.get("WKT")) if rec.get("WKT") else
                        np.zeros((0, 2), dtype=np.float32))
    if not rows:
        raise ValueError(f"No routable 2040 road links found in {path}")
    return _build(rows, geom, params)


def load_from_shapefile(path: str, params: Optional[Params] = None) -> Network:
    """Load from an ESRI shapefile using pyshp (shapefile module).

    ``path`` is the base path (with or without .shp). Geometry comes from the
    polyline parts; attributes from the DBF.
    """
    try:
        import shapefile  # pyshp
    except ImportError as e:  # pragma: no cover - depends on optional dep
        raise RuntimeError(
            "Reading .shp requires pyshp (`pip install pyshp`). "
            "Convert to CSV or install pyshp.") from e
    params = params or Params()
    sf = shapefile.Reader(path)
    fields = [f[0] for f in sf.fields[1:]]  # skip DeletionFlag
    rows, geom = [], []
    for sr in sf.iterShapeRecords():
        rec = dict(zip(fields, sr.record))
        norm = _accept_record(rec)
        if norm is None:
            continue
        rows.append(norm)
        pts = np.asarray(sr.shape.points, dtype=np.float32) if sr.shape.points \
            else np.zeros((0, 2), dtype=np.float32)
        geom.append(pts)
    if not rows:
        raise ValueError(f"No routable 2040 road links found in {path}")
    return _build(rows, geom, params)


def _parse_wkt(wkt: str) -> np.ndarray:
    """Parse a 'LINESTRING (x y, x y, ...)' into an (k,2) float32 array."""
    try:
        inner = wkt[wkt.index("(") + 1: wkt.rindex(")")]
        pts = [tuple(map(float, p.strip().split()[:2])) for p in inner.split(",")]
        return np.asarray(pts, dtype=np.float32)
    except (ValueError, IndexError):
        return np.zeros((0, 2), dtype=np.float32)


def load_network(path: str, params: Optional[Params] = None) -> Network:
    """Dispatch on extension: .shp -> shapefile, else CSV."""
    if path.lower().endswith(".shp"):
        return load_from_shapefile(path, params)
    return load_from_csv(path, params)
