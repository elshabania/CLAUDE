"""Zone / land-use loader for ``STEAM_landuse_2040.csv`` (section 2B).

One row per zone; all 29 columns are recognised but only the modelling drivers
are kept as typed arrays. External zones with neither population nor jobs are
flagged (``routable``) so the rest of the engine can ignore them.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from typing import Optional

import numpy as np

# columns kept as numeric driver arrays
_INT_COLS = ["Z", "DISTRICT", "AREATYPE", "AREATYPE2", "URBAN_RURA",
             "METRO_AREA", "METRO_ACCESS", "REG", "LU_CLASS"]
_FLOAT_COLS = ["SHAPEAREA", "POP_TOT", "HH", "WORKER", "STUDENT", "LABOURER",
               "GFA_TOTAL", "RES_GFA", "RETAIL_GFA", "OFFICE_GFA", "IND_GFA",
               "SCHOOL_GFA", "MED_GFA", "OTHER_GFA", "ACTIVITY",
               "CENTROIDX", "CENTROIDY"]


@dataclass
class Zones:
    z: np.ndarray                 # int64 zone id (1-based, key)
    district: np.ndarray          # int64 aggregation key
    distname: list                # text
    areatype: np.ndarray          # int
    urban_rura: np.ndarray        # int (1 urban / 2 rural)
    metro_access: np.ndarray      # int (1 = rail access)
    reg: np.ndarray               # int region
    lu_class: np.ndarray          # int broad land-use class
    shapearea: np.ndarray         # km^2
    pop: np.ndarray               # POP_TOT (productions driver)
    hh: np.ndarray
    worker: np.ndarray            # jobs (attractions driver)
    student: np.ndarray
    retail_gfa: np.ndarray
    office_gfa: np.ndarray
    ind_gfa: np.ndarray
    school_gfa: np.ndarray
    centroid: np.ndarray          # (n,2) float32 metres
    routable: np.ndarray          # bool: has population or jobs
    node: Optional[np.ndarray] = None   # nearest network node index per zone

    @property
    def n_zones(self) -> int:
        return int(self.z.shape[0])

    @property
    def n_routable(self) -> int:
        return int(self.routable.sum())


def _f(rec, key, default=0.0):
    v = rec.get(key)
    try:
        return float(v) if v not in (None, "") else default
    except ValueError:
        return default


def load_zones(path: str) -> Zones:
    rows = []
    with open(path, newline="") as fh:
        for rec in csv.DictReader(fh):
            rows.append(rec)
    if not rows:
        raise ValueError(f"No zone rows in {path}")

    def col_i(name):
        return np.array([int(_f(r, name)) for r in rows], dtype=np.int64)

    def col_f(name):
        return np.array([_f(r, name) for r in rows], dtype=np.float32)

    pop = col_f("POP_TOT")
    worker = col_f("WORKER")
    zones = Zones(
        z=col_i("Z"),
        district=col_i("DISTRICT"),
        distname=[r.get("DISTNAME", "") for r in rows],
        areatype=col_i("AREATYPE"),
        urban_rura=col_i("URBAN_RURA"),
        metro_access=col_i("METRO_ACCESS"),
        reg=col_i("REG"),
        lu_class=col_i("LU_CLASS"),
        shapearea=col_f("SHAPEAREA"),
        pop=pop,
        hh=col_f("HH"),
        worker=worker,
        student=col_f("STUDENT"),
        retail_gfa=col_f("RETAIL_GFA"),
        office_gfa=col_f("OFFICE_GFA"),
        ind_gfa=col_f("IND_GFA"),
        school_gfa=col_f("SCHOOL_GFA"),
        centroid=np.column_stack([col_f("CENTROIDX"), col_f("CENTROIDY")]).astype(np.float32),
        routable=(pop > 0) | (worker > 0),
    )
    return zones
