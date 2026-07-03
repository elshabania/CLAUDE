"""The road network model and its loaders.

A :class:`Network` is a struct-of-arrays: one entry per kept road link, plus a
flat polyline-geometry buffer for drawing and barrier tests, and a node
coordinate table.  Capacity and free-flow time are *derived* arrays recomputed
from :class:`~steam_core.settings.Settings` whenever the editable defaults or a
link's lane count change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .classify import classify_ltype, NONROAD, class_name
from .settings import Settings


@dataclass
class Network:
    """Road links + nodes + geometry, all as parallel NumPy arrays."""

    # Per-link arrays (length = n_links).
    link_id: np.ndarray          # OBJECTID (int64)
    node_a: np.ndarray           # remapped from-node index (int32, 0..N-1)
    node_b: np.ndarray           # remapped to-node index   (int32, 0..N-1)
    klass: np.ndarray            # facility-class code (int8)
    ltype: np.ndarray            # raw LTYPE_2040 (int16)
    lanes: np.ndarray            # LANE_2040, >=1 (int16)
    length: np.ndarray           # SHAPE_Leng, metres (float64)
    oneway: np.ndarray           # bool; True => digitised direction only

    # Node table.
    node_xy: np.ndarray          # (N, 2) projected-metre coordinates (float64)
    node_raw: np.ndarray         # original node ids (int64)

    # Flat polyline geometry for drawing / barrier crossing.
    geom_xy: np.ndarray          # (P, 2) float64
    geom_off: np.ndarray         # (n_links + 1,) int64 offsets into geom_xy

    # Derived (filled by :meth:`recompute_costs`).
    capacity: np.ndarray = field(default=None)   # veh/h (float64)
    fftime: np.ndarray = field(default=None)     # free-flow time, seconds

    @property
    def n_links(self) -> int:
        return len(self.link_id)

    @property
    def n_nodes(self) -> int:
        return len(self.node_xy)

    def class_names(self) -> list[str]:
        return [class_name(c) for c in self.klass]

    def recompute_costs(self, settings: Settings) -> None:
        """Fill :attr:`capacity` and :attr:`fftime` from current settings.

        ``capacity = max(1, lanes) * cap_per_lane[class]`` and
        ``fftime = length / (speed_kmh/3.6)``.
        """
        from .classify import CODE_CLASS

        cap_lane = np.zeros(len(CODE_CLASS), dtype=np.float64)
        speed = np.zeros(len(CODE_CLASS), dtype=np.float64)
        for code, name in CODE_CLASS.items():
            cap_lane[code] = settings.cap_per_lane(name)
            speed[code] = settings.speed_kmh(name)

        klass = np.clip(self.klass, 0, len(CODE_CLASS) - 1)
        lanes = np.maximum(1, self.lanes).astype(np.float64)
        self.capacity = lanes * cap_lane[klass]
        # speed km/h -> m/s, time = length / speed_ms.
        speed_ms = np.maximum(speed[klass], 1e-6) / 3.6
        self.fftime = self.length / speed_ms

    # ---- geometry helpers ------------------------------------------------
    def link_polyline(self, i: int) -> np.ndarray:
        return self.geom_xy[self.geom_off[i]:self.geom_off[i + 1]]

    def bounds(self) -> tuple[float, float, float, float]:
        """(xmin, ymin, xmax, ymax) over all geometry."""
        if len(self.geom_xy) == 0:
            return (0.0, 0.0, 1.0, 1.0)
        mn = self.geom_xy.min(axis=0)
        mx = self.geom_xy.max(axis=0)
        return float(mn[0]), float(mn[1]), float(mx[0]), float(mx[1])


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_network(path: str | Path, settings: Settings | None = None,
                 year_field: str = "LINK_2040",
                 ltype_field: str = "LTYPE_2040",
                 lane_field: str = "LANE_2040") -> Network:
    """Load a :class:`Network` from a shapefile (``.shp``) or CSV.

    Filters to ``LINK_2040 == 1``, drops rail and protected link types, and
    classifies by ``LTYPE_2040``.  ``settings`` (if given) is used to fill the
    derived cost arrays straight away.
    """
    path = Path(path)
    if path.suffix.lower() == ".shp":
        net = _load_shapefile(path, year_field, ltype_field, lane_field)
    elif path.suffix.lower() in (".csv", ".txt"):
        net = _load_csv(path, year_field, ltype_field, lane_field)
    else:
        raise ValueError(f"Unsupported network format: {path.suffix}")
    net.recompute_costs(settings or Settings())
    return net


def _field_getter(field_names: list[str], record):
    """Return a function that fetches a record field by name, case-insensitive,
    trying a list of aliases; returns ``None`` if none present."""
    upper = {f.upper(): i for i, f in enumerate(field_names)}

    def get(record, aliases, default=None):
        for a in aliases:
            i = upper.get(a.upper())
            if i is not None:
                v = record[i]
                if v not in ("", None):
                    return v
        return default

    return get


def _assemble(rows, geoms) -> Network:
    """Build a :class:`Network` from a list of per-link dicts and polylines.

    ``rows`` items have keys: link_id, raw_a, raw_b, klass, ltype, lanes,
    length, oneway.  ``geoms`` is a parallel list of (k,2) float arrays.
    """
    n = len(rows)
    link_id = np.empty(n, dtype=np.int64)
    raw_a = np.empty(n, dtype=np.int64)
    raw_b = np.empty(n, dtype=np.int64)
    klass = np.empty(n, dtype=np.int8)
    ltype = np.empty(n, dtype=np.int16)
    lanes = np.empty(n, dtype=np.int16)
    length = np.empty(n, dtype=np.float64)
    oneway = np.empty(n, dtype=bool)

    for i, r in enumerate(rows):
        link_id[i] = r["link_id"]
        raw_a[i] = r["raw_a"]
        raw_b[i] = r["raw_b"]
        klass[i] = r["klass"]
        ltype[i] = r["ltype"]
        lanes[i] = r["lanes"]
        length[i] = r["length"]
        oneway[i] = r["oneway"]

    # Remap node ids to a dense 0..N-1 index.
    uniq, inv = np.unique(np.concatenate([raw_a, raw_b]), return_inverse=True)
    node_a = inv[:n].astype(np.int32)
    node_b = inv[n:].astype(np.int32)
    node_raw = uniq.astype(np.int64)

    # Flat geometry buffer.
    geom_off = np.zeros(n + 1, dtype=np.int64)
    for i, g in enumerate(geoms):
        geom_off[i + 1] = geom_off[i] + len(g)
    total = geom_off[-1]
    geom_xy = np.empty((total, 2), dtype=np.float64)
    for i, g in enumerate(geoms):
        geom_xy[geom_off[i]:geom_off[i + 1]] = g

    # Node coordinates from link endpoints (first/last geometry point).
    node_xy = np.zeros((len(node_raw), 2), dtype=np.float64)
    seen = np.zeros(len(node_raw), dtype=bool)
    for i in range(n):
        g = geom_xy[geom_off[i]:geom_off[i + 1]]
        if len(g) == 0:
            continue
        a, b = node_a[i], node_b[i]
        if not seen[a]:
            node_xy[a] = g[0]
            seen[a] = True
        if not seen[b]:
            node_xy[b] = g[-1]
            seen[b] = True

    return Network(
        link_id=link_id, node_a=node_a, node_b=node_b, klass=klass,
        ltype=ltype, lanes=lanes, length=length, oneway=oneway,
        node_xy=node_xy, node_raw=node_raw, geom_xy=geom_xy, geom_off=geom_off,
    )


def _row_from_fields(get, rec, oid, year_field, ltype_field, lane_field):
    """Filter + classify one record; return a row dict or ``None`` to drop."""
    link_year = get(rec, [year_field, "LINK_2040"], 0)
    if link_year is None or int(float(link_year)) != 1:
        return None
    if int(float(get(rec, ["RAIL"], 0) or 0)) == 1:
        return None
    ltype = int(float(get(rec, [ltype_field, "LTYPE_2040"], -1)))
    klass = classify_ltype(ltype)
    if klass == NONROAD:
        return None

    a = get(rec, ["A", "FNODE"], None)
    b = get(rec, ["B", "TNODE"], None)
    if a is None or b is None:
        return None
    lanes = int(float(get(rec, [lane_field, "LANE_2040"], 1) or 1))
    length = float(get(rec, ["SHAPE_Leng", "SHAPE_LENG", "LENGTH"], 0.0) or 0.0)
    # One-way if the directional field carries a non-zero code (a value of 0 or
    # a blank means two-way).
    oway = get(rec, ["LT40_OWAY", "LN40_OWAY", "LI40_OWAY"], 0)
    try:
        oneway = float(oway) != 0.0
    except (TypeError, ValueError):
        oneway = False

    return {
        "link_id": int(float(oid)),
        "raw_a": int(float(a)),
        "raw_b": int(float(b)),
        "klass": klass,
        "ltype": ltype,
        "lanes": max(1, lanes),
        "length": length,
        "oneway": bool(oneway),
    }


def _load_shapefile(path, year_field, ltype_field, lane_field) -> Network:
    import shapefile  # pyshp

    reader = shapefile.Reader(str(path))
    field_names = [f[0] for f in reader.fields[1:]]  # drop deletion flag
    get = _field_getter(field_names, None)

    rows, geoms = [], []
    for oid, sr in enumerate(reader.iterShapeRecords()):
        rec = sr.record
        length_fallback = None
        row = _row_from_fields(get, list(rec), get(list(rec), ["OBJECTID"], oid),
                               year_field, ltype_field, lane_field)
        if row is None:
            continue
        pts = np.asarray(sr.shape.points, dtype=np.float64)
        if len(pts) < 2:
            continue
        if row["length"] <= 0:  # derive from geometry if SHAPE_Leng missing
            row["length"] = float(np.hypot(*(np.diff(pts, axis=0).T)).sum())
        rows.append(row)
        geoms.append(pts)

    if not rows:
        raise ValueError(f"No 2040 road links found in {path}")
    return _assemble(rows, geoms)


def _load_csv(path, year_field, ltype_field, lane_field) -> Network:
    """CSV network loader.

    Recognises the DBF field names.  Geometry comes from a ``WKT`` /
    ``geometry`` LINESTRING column if present, else from straight ``AX,AY,BX,BY``
    endpoint columns.
    """
    import csv

    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        get = _field_getter(header, None)
        rows, geoms = [], []
        for line in reader:
            if not line:
                continue
            oid = get(line, ["OBJECTID"], len(rows))
            row = _row_from_fields(get, line, oid, year_field, ltype_field,
                                   lane_field)
            if row is None:
                continue
            pts = _csv_geometry(get, line)
            if pts is None or len(pts) < 2:
                continue
            if row["length"] <= 0:
                row["length"] = float(np.hypot(*(np.diff(pts, axis=0).T)).sum())
            rows.append(row)
            geoms.append(pts)
    if not rows:
        raise ValueError(f"No 2040 road links found in {path}")
    return _assemble(rows, geoms)


def _csv_geometry(get, line) -> np.ndarray | None:
    wkt = get(line, ["WKT", "geometry", "GEOMETRY"], None)
    if wkt:
        return _parse_linestring(wkt)
    ax = get(line, ["AX", "X1", "FROMX"], None)
    ay = get(line, ["AY", "Y1", "FROMY"], None)
    bx = get(line, ["BX", "X2", "TOX"], None)
    by = get(line, ["BY", "Y2", "TOY"], None)
    if None in (ax, ay, bx, by):
        return None
    return np.array([[float(ax), float(ay)], [float(bx), float(by)]],
                    dtype=np.float64)


def _parse_linestring(wkt: str) -> np.ndarray | None:
    s = wkt.strip().upper()
    if not s.startswith("LINESTRING"):
        return None
    inside = s[s.index("(") + 1:s.rindex(")")]
    pts = []
    for pair in inside.split(","):
        xy = pair.strip().split()
        if len(xy) >= 2:
            pts.append((float(xy[0]), float(xy[1])))
    return np.array(pts, dtype=np.float64) if len(pts) >= 2 else None
