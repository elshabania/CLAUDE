"""Land-use / zone loader.

Reads ``STEAM_landuse_2040.csv`` (all 29 columns from Part 1B) into a
struct-of-arrays :class:`Zones`.  Provides the productions/attractions drivers
the gravity model needs and the centroid coordinates used to connect zones to
network nodes.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Column name -> (attribute, numpy dtype, is_float).  Only the columns the
# engine actually uses are typed; everything else is kept as raw strings in
# ``Zones.extra`` for display.
_NUM_COLS = {
    "Z": "z", "DISTRICT": "district", "AREATYPE": "areatype",
    "AREATYPE2": "areatype2", "URBAN_RURA": "urban_rura",
    "METRO_AREA": "metro_area", "METRO_ACCESS": "metro_access", "REG": "reg",
    "PRODSECTOR": "prodsector", "FREIGHT": "freight", "LU_CLASS": "lu_class",
    "SHAPEAREA": "shapearea", "POP_TOT": "pop_tot", "HH": "hh",
    "WORKER": "worker", "STUDENT": "student", "LABOURER": "labourer",
    "GFA_TOTAL": "gfa_total", "RES_GFA": "res_gfa", "RETAIL_GFA": "retail_gfa",
    "OFFICE_GFA": "office_gfa", "IND_GFA": "ind_gfa", "SCHOOL_GFA": "school_gfa",
    "MED_GFA": "med_gfa", "OTHER_GFA": "other_gfa", "ACTIVITY": "activity",
    "CENTROIDX": "centroidx", "CENTROIDY": "centroidy",
}
_INT_ATTRS = {"z", "district", "areatype", "areatype2", "urban_rura",
              "metro_area", "metro_access", "reg", "prodsector", "freight",
              "lu_class", "pop_tot", "hh", "worker", "student", "labourer"}


@dataclass
class Zones:
    """One row per traffic zone, columns as parallel arrays."""

    z: np.ndarray
    district: np.ndarray
    distname: list
    areatype: np.ndarray
    areatype2: np.ndarray
    urban_rura: np.ndarray
    metro_area: np.ndarray
    metro_access: np.ndarray
    reg: np.ndarray
    prodsector: np.ndarray
    freight: np.ndarray
    lu_class: np.ndarray
    shapearea: np.ndarray
    pop_tot: np.ndarray
    hh: np.ndarray
    worker: np.ndarray
    student: np.ndarray
    labourer: np.ndarray
    gfa_total: np.ndarray
    res_gfa: np.ndarray
    retail_gfa: np.ndarray
    office_gfa: np.ndarray
    ind_gfa: np.ndarray
    school_gfa: np.ndarray
    med_gfa: np.ndarray
    other_gfa: np.ndarray
    activity: np.ndarray
    centroidx: np.ndarray
    centroidy: np.ndarray

    @property
    def n(self) -> int:
        return len(self.z)

    def centroids(self) -> np.ndarray:
        return np.column_stack([self.centroidx, self.centroidy])

    def internal_mask(self) -> np.ndarray:
        """Zones with any population or jobs (the routable / loadable ones)."""
        return (self.pop_tot > 0) | (self.worker > 0) | (self.student > 0)

    def index_of(self, zone_id: int) -> int:
        """Row index for a 1-based zone id, or -1."""
        hits = np.where(self.z == zone_id)[0]
        return int(hits[0]) if len(hits) else -1


def load_zones(path: str | Path) -> Zones:
    path = Path(path)
    cols: dict[str, list] = {name: [] for name in _NUM_COLS.values()}
    distname: list[str] = []

    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        header = [h.strip() for h in next(reader)]
        idx = {h.upper(): i for i, h in enumerate(header)}
        for line in reader:
            if not line or all(c == "" for c in line):
                continue
            for src, attr in _NUM_COLS.items():
                i = idx.get(src.upper())
                raw = line[i] if i is not None and i < len(line) else ""
                cols[attr].append(_num(raw, attr))
            di = idx.get("DISTNAME")
            distname.append(line[di] if di is not None and di < len(line) else "")

    arrays = {}
    for attr, values in cols.items():
        dtype = np.int64 if attr in _INT_ATTRS else np.float64
        arrays[attr] = np.asarray(values, dtype=dtype)
    return Zones(distname=distname, **arrays)


def _num(raw: str, attr: str):
    raw = (raw or "").strip()
    if raw == "":
        return 0
    try:
        v = float(raw)
    except ValueError:
        return 0
    return int(v) if attr in _INT_ATTRS else v
