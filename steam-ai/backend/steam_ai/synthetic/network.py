"""Synthetic network, zones and land use for the miniature STEAM-like run.

Everything here is deterministic given ``(grid, n_zones, seed)``. The network is
a ``grid x grid`` lattice of nodes placed in real WGS84 coordinates around Abu
Dhabi island (lon 54.35-54.55, lat 24.40-24.52). Whole grid rows and columns
carry one link class each:

* ``FWY``  the central E-W and N-S radials plus a ring (rows/cols 2 and grid-3),
* ``ART``  every third row/column that is not FWY,
* ``COL``  every second row/column not already classed,
* ``LOC``  everything else,
* ``CONN`` centroid connectors from each zone centroid to its two nearest
  non-FWY grid nodes.

Two-way links are written as two directed rows. Node ids: centroids are
``1..n_zones``; grid nodes are ``1000 + row*grid + col + 1``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

LON_MIN, LON_MAX = 54.35, 54.55
LAT_MIN, LAT_MAX = 24.40, 24.52
CENTRE_LON, CENTRE_LAT = 54.45, 24.46
EARTH_R_M = 6_371_008.8
GRID_NODE_BASE = 1000
N_SECTORS = 6

# link_class -> (lanes, capacity per lane per hour, free-flow speed km/h)
CLASS_PARAMS: dict[str, tuple[int, float, float]] = {
    "FWY": (3, 2000.0, 100.0),
    "ART": (2, 900.0, 60.0),
    "COL": (1, 700.0, 50.0),
    "LOC": (1, 500.0, 40.0),
    "CONN": (1, 9999.0, 30.0),
}
# Area type by great-circle distance (km) from the centre.
AREA_TYPE_BREAKS_KM: list[tuple[float, str]] = [(3.0, "CBD"), (6.0, "URB"), (9.0, "SUB")]


def haversine_m(
    lon1: np.ndarray | float,
    lat1: np.ndarray | float,
    lon2: np.ndarray | float,
    lat2: np.ndarray | float,
) -> np.ndarray | float:
    """Great-circle distance in metres (vectorised)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlmb = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlmb / 2) ** 2
    return 2 * EARTH_R_M * np.arcsin(np.sqrt(a))


def area_type_for_km(d_km: np.ndarray) -> np.ndarray:
    out = np.full(d_km.shape, "RUR", dtype=object)
    for limit, code in reversed(AREA_TYPE_BREAKS_KM):
        out[d_km < limit] = code
    return out


def sector_for(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Angular wedge sector S1..S6 around the centre (contiguous sectors)."""
    dx = (np.asarray(lon) - CENTRE_LON) * math.cos(math.radians(CENTRE_LAT))
    dy = np.asarray(lat) - CENTRE_LAT
    ang = (np.degrees(np.arctan2(dy, dx)) + 360.0) % 360.0
    idx = np.minimum((ang // (360.0 / N_SECTORS)).astype(int), N_SECTORS - 1)
    return np.array([f"S{i + 1}" for i in idx], dtype=object)


def linestring_wkt(lon1: float, lat1: float, lon2: float, lat2: float) -> str:
    return f"LINESTRING({lon1:.6f} {lat1:.6f}, {lon2:.6f} {lat2:.6f})"


def polygon_wkt(lon_min: float, lat_min: float, lon_max: float, lat_max: float) -> str:
    return (
        f"POLYGON(({lon_min:.6f} {lat_min:.6f}, {lon_max:.6f} {lat_min:.6f}, "
        f"{lon_max:.6f} {lat_max:.6f}, {lon_min:.6f} {lat_max:.6f}, "
        f"{lon_min:.6f} {lat_min:.6f}))"
    )


@dataclass
class Network:
    """The synthetic network skeleton plus zones and land use."""

    grid: int
    n_zones: int
    nodes: pd.DataFrame  # node_id, x, y, is_centroid, junction_control
    links: pd.DataFrame  # schema.LINKS minus source_* columns
    zones: pd.DataFrame  # schema.ZONES minus source_* columns
    land_use: pd.DataFrame  # zone_id, variable, value
    control_totals: pd.DataFrame  # variable, region, value
    grid_ids: np.ndarray  # (grid, grid) node ids
    row_class: list[str]
    col_class: list[str]
    fwy_row: int
    fwy_col: int
    next_link_id: int
    zone_area_km2: float

    def node_xy(self) -> dict[int, tuple[float, float]]:
        return {
            int(n): (float(x), float(y))
            for n, x, y in zip(self.nodes.node_id, self.nodes.x, self.nodes.y, strict=True)
        }

    def art_rows(self) -> list[int]:
        return [r for r, c in enumerate(self.row_class) if c == "ART"]

    def art_cols(self) -> list[int]:
        return [c for c, k in enumerate(self.col_class) if k == "ART"]

    def zone_sectors(self) -> dict[int, str]:
        return dict(zip(self.zones.zone_id.astype(int), self.zones.sector_id, strict=True))


def _line_classes(grid: int) -> tuple[list[str], int]:
    """Class of each whole grid row (or column) and the index of the central FWY line."""
    centre = grid // 2
    ring = {2, grid - 3}
    classes: list[str] = []
    for i in range(grid):
        if i == centre or i in ring:
            classes.append("FWY")
        elif i % 3 == 0:
            classes.append("ART")
        elif i % 2 == 0:
            classes.append("COL")
        else:
            classes.append("LOC")
    return classes, centre


def _junction_for(row_cls: str, col_cls: str, r: int, c: int) -> str:
    if "FWY" in (row_cls, col_cls):
        return "NONE"  # grade separated
    if row_cls == "ART" and col_cls == "ART":
        return "SIGNAL"
    if "ART" in (row_cls, col_cls):
        return "SIGNAL" if (r + c) % 2 == 0 else "ROUNDABOUT"
    if "COL" in (row_cls, col_cls) and (r + c) % 3 == 0:
        return "ROUNDABOUT"
    return "NONE"


def build_network(grid: int, n_zones: int, seed: int, *, fwy_extra_lane: bool = False) -> Network:
    """Build the deterministic grid network, zones and base land use.

    ``fwy_extra_lane`` adds one lane to the central E-W FWY corridor (used by
    the scenario variant).
    """
    if grid < 8:
        raise ValueError("grid must be >= 8 so that FWY/ART/COL/LOC rows all exist")
    if n_zones < 4:
        raise ValueError("n_zones must be >= 4")
    rng = np.random.default_rng(seed)
    row_class, fwy_row = _line_classes(grid)
    col_class, fwy_col = _line_classes(grid)

    # --- grid nodes ---------------------------------------------------------
    gx = np.linspace(LON_MIN + 0.006, LON_MAX - 0.006, grid)
    gy = np.linspace(LAT_MIN + 0.004, LAT_MAX - 0.004, grid)
    jitter_x = rng.normal(0.0, 0.0006, size=(grid, grid))
    jitter_y = rng.normal(0.0, 0.0004, size=(grid, grid))
    grid_ids = np.arange(grid * grid).reshape(grid, grid) + GRID_NODE_BASE + 1
    lon = np.repeat(gx[np.newaxis, :], grid, axis=0) + jitter_x  # [row, col]
    lat = np.repeat(gy[:, np.newaxis], grid, axis=1) + jitter_y

    junction = np.empty((grid, grid), dtype=object)
    for r in range(grid):
        for c in range(grid):
            junction[r, c] = _junction_for(row_class[r], col_class[c], r, c)

    # --- zones ---------------------------------------------------------------
    width_km = haversine_m(LON_MIN, CENTRE_LAT, LON_MAX, CENTRE_LAT) / 1000.0
    height_km = haversine_m(CENTRE_LON, LAT_MIN, CENTRE_LON, LAT_MAX) / 1000.0
    n_cols = max(2, int(round(math.sqrt(n_zones * width_km / height_km))))
    n_rows = int(math.ceil(n_zones / n_cols))
    cell_w = (LON_MAX - LON_MIN) / n_cols
    cell_h = (LAT_MAX - LAT_MIN) / n_rows
    zone_area_km2 = (width_km / n_cols) * (height_km / n_rows)
    zone_ids = np.arange(1, n_zones + 1)
    zr, zc = (zone_ids - 1) // n_cols, (zone_ids - 1) % n_cols
    z_lon_min = LON_MIN + zc * cell_w
    z_lat_min = LAT_MIN + zr * cell_h
    cx = z_lon_min + cell_w * rng.uniform(0.35, 0.65, size=n_zones)
    cy = z_lat_min + cell_h * rng.uniform(0.35, 0.65, size=n_zones)
    d_km = np.asarray(haversine_m(cx, cy, CENTRE_LON, CENTRE_LAT)) / 1000.0
    sectors = sector_for(cx, cy)
    district = np.array(
        [f"D{s[1:]}{'A' if d < 5.0 else 'B'}" for s, d in zip(sectors, d_km, strict=True)],
        dtype=object,
    )
    zones = pd.DataFrame(
        {
            "zone_id": zone_ids.astype(np.int64),
            "sector_id": sectors,
            "district": district,
            "region": "AD",
            "geometry_wkt": [
                polygon_wkt(a, b, a + cell_w, b + cell_h)
                for a, b in zip(z_lon_min, z_lat_min, strict=True)
            ],
            "centroid_x": cx,
            "centroid_y": cy,
        }
    )

    # --- nodes table ---------------------------------------------------------
    nodes = pd.DataFrame(
        {
            "node_id": np.concatenate([zone_ids, grid_ids.ravel()]).astype(np.int64),
            "x": np.concatenate([cx, lon.ravel()]),
            "y": np.concatenate([cy, lat.ravel()]),
            "is_centroid": np.concatenate(
                [np.ones(n_zones, dtype=bool), np.zeros(grid * grid, dtype=bool)]
            ),
            "junction_control": np.concatenate(
                [np.full(n_zones, "NONE", dtype=object), junction.ravel()]
            ),
        }
    )

    # --- grid links ----------------------------------------------------------
    a_nodes: list[int] = []
    b_nodes: list[int] = []
    classes: list[str] = []
    b_junction: list[str] = []

    def add_two_way(n1: int, n2: int, cls: str, j1: str, j2: str) -> None:
        a_nodes.extend([n1, n2])
        b_nodes.extend([n2, n1])
        classes.extend([cls, cls])
        b_junction.extend([j2, j1])

    for r in range(grid):
        for c in range(grid - 1):  # horizontal links along row r
            add_two_way(
                int(grid_ids[r, c]),
                int(grid_ids[r, c + 1]),
                row_class[r],
                junction[r, c],
                junction[r, c + 1],
            )
    for c in range(grid):
        for r in range(grid - 1):  # vertical links along column c
            add_two_way(
                int(grid_ids[r, c]),
                int(grid_ids[r + 1, c]),
                col_class[c],
                junction[r, c],
                junction[r + 1, c],
            )

    # --- centroid connectors -------------------------------------------------
    non_fwy = np.array(
        [row_class[r] != "FWY" and col_class[c] != "FWY" for r in range(grid) for c in range(grid)]
    )
    cand_ids = grid_ids.ravel()[non_fwy]
    cand_lon, cand_lat = lon.ravel()[non_fwy], lat.ravel()[non_fwy]
    for z in range(n_zones):
        d = np.asarray(haversine_m(cx[z], cy[z], cand_lon, cand_lat))
        nearest = np.argsort(d)[:2]
        for k in nearest:
            add_two_way(int(zone_ids[z]), int(cand_ids[k]), "CONN", "NONE", "NONE")

    links = pd.DataFrame(
        {
            "link_id": np.arange(1, len(a_nodes) + 1, dtype=np.int64),
            "a_node": np.asarray(a_nodes, dtype=np.int64),
            "b_node": np.asarray(b_nodes, dtype=np.int64),
            "link_class": np.asarray(classes, dtype=object),
            "junction_type": np.asarray(b_junction, dtype=object),
        }
    )
    xy = dict(zip(nodes.node_id.astype(int), zip(nodes.x, nodes.y, strict=True), strict=True))
    ax = np.array([xy[int(n)][0] for n in links.a_node])
    ay = np.array([xy[int(n)][1] for n in links.a_node])
    bx = np.array([xy[int(n)][0] for n in links.b_node])
    by = np.array([xy[int(n)][1] for n in links.b_node])
    links["length_m"] = np.round(np.asarray(haversine_m(ax, ay, bx, by)), 1)
    mid_d_km = np.asarray(haversine_m((ax + bx) / 2, (ay + by) / 2, CENTRE_LON, CENTRE_LAT)) / 1e3
    links["area_type"] = area_type_for_km(mid_d_km)
    links["sector_id"] = sector_for((ax + bx) / 2, (ay + by) / 2)
    lanes = np.array([CLASS_PARAMS[c][0] for c in links.link_class], dtype=np.int32)
    cap_lane = np.array([CLASS_PARAMS[c][1] for c in links.link_class])
    links["ffs_kph"] = np.array([CLASS_PARAMS[c][2] for c in links.link_class])
    if fwy_extra_lane:
        on_fwy_row = links.a_node.isin(grid_ids[fwy_row]) & links.b_node.isin(grid_ids[fwy_row])
        lanes = np.where(on_fwy_row.to_numpy(), lanes + 1, lanes).astype(np.int32)
    links["lanes"] = lanes
    is_conn = (links.link_class == "CONN").to_numpy()
    links["capacity_vph"] = np.where(is_conn, 9999.0, lanes * cap_lane)
    links["oneway"] = False
    # Toll points on the ring FWY where it crosses the central N-S radial (eastbound only).
    links["toll_point"] = (
        links.link_class.eq("FWY")
        & links.a_node.isin(grid_ids[:, fwy_col])
        & links.b_node.isin(grid_ids[[2, grid - 3], :].ravel())
        & (links.a_node < links.b_node)
    )
    links["geometry_wkt"] = [
        linestring_wkt(x1, y1, x2, y2) for x1, y1, x2, y2 in zip(ax, ay, bx, by, strict=True)
    ]
    links = links[
        [
            "link_id",
            "a_node",
            "b_node",
            "length_m",
            "link_class",
            "area_type",
            "lanes",
            "capacity_vph",
            "ffs_kph",
            "oneway",
            "toll_point",
            "junction_type",
            "sector_id",
            "geometry_wkt",
        ]
    ]

    land_use, control_totals = _land_use(zones, d_km, rng)
    return Network(
        grid=grid,
        n_zones=n_zones,
        nodes=nodes,
        links=links,
        zones=zones,
        land_use=land_use,
        control_totals=control_totals,
        grid_ids=grid_ids,
        row_class=row_class,
        col_class=col_class,
        fwy_row=fwy_row,
        fwy_col=fwy_col,
        next_link_id=int(links.link_id.max()) + 1,
        zone_area_km2=zone_area_km2,
    )


LAND_USE_VARIABLES = ["POP", "EMP_TOTAL", "EMP_RETAIL", "STUDENTS", "HOTEL_ROOMS"]


def _land_use(
    zones: pd.DataFrame, d_km: np.ndarray, rng: np.random.Generator
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Gravity-toward-centre land use; values are synthetic, not observed."""
    n = len(zones)
    pop = 9000.0 * np.exp(-d_km / 7.0) * rng.lognormal(0.0, 0.35, n) + 400.0
    emp = 9500.0 * np.exp(-d_km / 3.5) * rng.lognormal(0.0, 0.4, n) + 250.0
    retail = emp * rng.uniform(0.12, 0.25, n)
    students = pop * rng.uniform(0.18, 0.28, n)
    hotels = np.where(d_km < 7.0, 900.0 * np.exp(-d_km / 2.0) * rng.lognormal(0.0, 0.6, n), 0.0)
    wide = pd.DataFrame(
        {
            "POP": np.round(pop),
            "EMP_TOTAL": np.round(emp),
            "EMP_RETAIL": np.round(retail),
            "STUDENTS": np.round(students),
            "HOTEL_ROOMS": np.round(hotels),
        }
    )
    return land_use_long(zones.zone_id.to_numpy(), wide)


def land_use_long(zone_ids: np.ndarray, wide: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Melt a wide land-use frame into schema form plus matching control totals."""
    rows = []
    for var in LAND_USE_VARIABLES:
        rows.append(
            pd.DataFrame(
                {"zone_id": zone_ids.astype(np.int64), "variable": var, "value": wide[var].values}
            )
        )
    long = pd.concat(rows, ignore_index=True)
    control = pd.DataFrame(
        {
            "variable": ["POP", "EMP_TOTAL"],
            "region": ["ALL", "ALL"],
            "value": [float(wide["POP"].sum()), float(wide["EMP_TOTAL"].sum())],
        }
    )
    return long, control


def land_use_wide(land_use: pd.DataFrame) -> pd.DataFrame:
    """Pivot the long land-use table back to one row per zone (index = zone_id)."""
    return land_use.pivot(index="zone_id", columns="variable", values="value").fillna(0.0)
