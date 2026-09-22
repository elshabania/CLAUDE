"""Gravity-model demand and skims for the synthetic run.

Demand is produced per ``(purpose, mode, period)`` as dense ``n_zones x n_zones``
matrices. CAR matrices are vehicle trips (person trips divided by a fixed
occupancy), PT matrices are person trips. All numbers are synthetic.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .network import CENTRE_LAT, CENTRE_LON, Network, haversine_m, land_use_wide

PURPOSES = ["HBW", "HBO", "NHB"]
MODES = ["CAR", "PT"]
ROUTE_FACTOR = 1.3  # network path length / great-circle distance
CAR_OCCUPANCY = 1.3
MIN_CELL_TRIPS = 0.05  # cells below this are dropped from the long-form table

# purpose -> (daily rate applied to productions, distance-decay beta per km)
PURPOSE_PARAMS: dict[str, tuple[float, float]] = {
    "HBW": (0.85, 0.12),
    "HBO": (1.40, 0.20),
    "NHB": (0.55, 0.25),
}
# purpose -> period -> (share travelling P->A, share travelling A->P); each purpose sums to 1
PERIOD_SHARES: dict[str, dict[str, tuple[float, float]]] = {
    "HBW": {
        "AM": (0.38, 0.03),
        "MD": (0.05, 0.07),
        "PM": (0.03, 0.28),
        "EV": (0.02, 0.08),
        "NT": (0.03, 0.03),
    },
    "HBO": {
        "AM": (0.10, 0.05),
        "MD": (0.20, 0.18),
        "PM": (0.14, 0.12),
        "EV": (0.08, 0.08),
        "NT": (0.03, 0.02),
    },
    "NHB": {
        "AM": (0.06, 0.06),
        "MD": (0.24, 0.24),
        "PM": (0.12, 0.12),
        "EV": (0.06, 0.06),
        "NT": (0.02, 0.02),
    },
}
# Average CAR speed (km/h) implied by the skims, by period; PT in-vehicle speed and waits.
CAR_SKIM_SPEED_KPH = {"AM": 38.0, "MD": 48.0, "PM": 37.0, "EV": 55.0, "NT": 62.0}
PT_SPEED_KPH = 22.0
PT_WAIT_S = {"AM": 300.0, "MD": 450.0, "PM": 300.0, "EV": 600.0, "NT": 900.0}
PT_ACCESS_S = 480.0
CAR_TERMINAL_S = 60.0


@dataclass
class Demand:
    zone_ids: np.ndarray
    matrices: dict[tuple[str, str, str], np.ndarray]  # (purpose, mode, period) -> dense
    dist_m: np.ndarray  # zone x zone route distance in metres (CAR)
    zone_centre_km: np.ndarray  # zone distance to CBD centre

    def total(self, mode: str, period: str) -> np.ndarray:
        """Sum over purposes for one mode and period."""
        out = np.zeros_like(self.dist_m)
        for (p, m, per), mat in self.matrices.items():
            if m == mode and per == period:
                out += mat
        return out


def zone_distance_m(net: Network) -> tuple[np.ndarray, np.ndarray]:
    """Route distance (great-circle x ROUTE_FACTOR) and distance to centre, in metres/km."""
    cx = net.zones.centroid_x.to_numpy()
    cy = net.zones.centroid_y.to_numpy()
    gc = np.asarray(haversine_m(cx[:, None], cy[:, None], cx[None, :], cy[None, :]))
    dist = gc * ROUTE_FACTOR
    intra = 0.5 * np.sqrt(net.zone_area_km2) * 1000.0
    np.fill_diagonal(dist, intra)
    centre_km = np.asarray(haversine_m(cx, cy, CENTRE_LON, CENTRE_LAT)) / 1000.0
    return dist, centre_km


def _gravity(prod: np.ndarray, attr: np.ndarray, dist_km: np.ndarray, beta: float) -> np.ndarray:
    """Singly constrained gravity model: rows sum to productions."""
    f = np.exp(-beta * dist_km) * attr[None, :]
    denom = f.sum(axis=1, keepdims=True)
    denom[denom == 0] = 1.0
    return prod[:, None] * f / denom


def build_demand(net: Network, periods: list[str], scale: float = 1.0) -> Demand:
    """Daily gravity trips split into purpose x mode x period matrices."""
    lu = land_use_wide(net.land_use).reindex(net.zones.zone_id.to_numpy()).fillna(0.0)
    pop = lu["POP"].to_numpy()
    emp = lu["EMP_TOTAL"].to_numpy()
    retail = lu["EMP_RETAIL"].to_numpy()
    students = lu["STUDENTS"].to_numpy()
    hotels = lu["HOTEL_ROOMS"].to_numpy()
    dist_m, centre_km = zone_distance_m(net)
    dist_km = dist_m / 1000.0

    productions = {
        "HBW": pop,
        "HBO": pop + 0.5 * hotels,
        "NHB": 0.6 * emp + 0.1 * pop + 0.3 * hotels,
    }
    attractions = {
        "HBW": emp + 0.2 * students,
        "HBO": 0.5 * pop + 3.0 * retail + 0.3 * emp + 0.8 * students + 2.0 * hotels,
        "NHB": 0.6 * emp + 0.1 * pop + 1.5 * retail,
    }
    # PT share is highest for CBD-to-CBD movements and decays outwards.
    pt_share = 0.06 + 0.24 * np.exp(-(centre_km[:, None] + centre_km[None, :]) / 6.0)

    matrices: dict[tuple[str, str, str], np.ndarray] = {}
    for purpose in PURPOSES:
        rate, beta = PURPOSE_PARAMS[purpose]
        daily = _gravity(productions[purpose] * rate * scale, attractions[purpose], dist_km, beta)
        for period in periods:
            fwd, rev = PERIOD_SHARES[purpose][period]
            person = fwd * daily + rev * daily.T
            matrices[(purpose, "PT", period)] = person * pt_share
            matrices[(purpose, "CAR", period)] = person * (1.0 - pt_share) / CAR_OCCUPANCY
    return Demand(
        zone_ids=net.zones.zone_id.to_numpy().astype(np.int64),
        matrices=matrices,
        dist_m=dist_m,
        zone_centre_km=centre_km,
    )


def scale_sector_demand(demand: Demand, zone_sectors: dict[int, str], sector: str, factor: float) -> None:
    """Multiply every trip with an origin or destination in ``sector`` by ``factor`` (in place)."""
    mask = np.array([zone_sectors[int(z)] == sector for z in demand.zone_ids])
    cell = mask[:, None] | mask[None, :]
    for mat in demand.matrices.values():
        mat[cell] *= factor


def lengthen_trips(demand: Demand, purpose: str, mode: str, factor: float) -> float:
    """Reweight ``(purpose, mode)`` matrices so the trip-weighted mean distance grows by ``factor``.

    Row totals are preserved. Returns the gamma used in the ``exp(gamma * d_km)`` reweighting.
    """
    d_km = demand.dist_m / 1000.0
    keys = [k for k in demand.matrices if k[0] == purpose and k[1] == mode]
    base = sum(demand.matrices[k] for k in keys)
    target = (base * d_km).sum() / base.sum() * factor

    def mean_for(gamma: float) -> float:
        w = np.exp(gamma * d_km)
        m = base * w
        m *= base.sum(axis=1, keepdims=True) / np.maximum(m.sum(axis=1, keepdims=True), 1e-12)
        return float((m * d_km).sum() / m.sum())

    lo, hi = 0.0, 2.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if mean_for(mid) < target:
            lo = mid
        else:
            hi = mid
    gamma = 0.5 * (lo + hi)
    w = np.exp(gamma * d_km)
    for k in keys:
        m = demand.matrices[k]
        row = m.sum(axis=1, keepdims=True)
        new = m * w
        new *= row / np.maximum(new.sum(axis=1, keepdims=True), 1e-12)
        demand.matrices[k] = new
    return gamma


def od_long(demand: Demand, source_file: str) -> pd.DataFrame:
    """Long-form DEMAND matrices, non-zero cells only (schema.OD)."""
    n = len(demand.zone_ids)
    oi, di = np.meshgrid(demand.zone_ids, demand.zone_ids, indexing="ij")
    frames = []
    for (purpose, mode, period), mat in demand.matrices.items():
        keep = (np.abs(mat) >= MIN_CELL_TRIPS).ravel()
        frames.append(
            pd.DataFrame(
                {
                    "matrix_kind": "DEMAND",
                    "purpose": purpose,
                    "mode": mode,
                    "period": period,
                    "origin": oi.ravel()[keep],
                    "destination": di.ravel()[keep],
                    "trips": np.round(mat.reshape(n * n)[keep], 4),
                }
            )
        )
    out = pd.concat(frames, ignore_index=True)
    out["source_file"] = source_file
    return out


def skims_long(demand: Demand, periods: list[str], source_file: str) -> pd.DataFrame:
    """TIME (seconds) and DIST (metres) skims for CAR and PT by period (schema.SKIMS)."""
    n = len(demand.zone_ids)
    oi, di = np.meshgrid(demand.zone_ids, demand.zone_ids, indexing="ij")
    car_dist = demand.dist_m
    pt_dist = demand.dist_m * 1.1
    frames = []
    for period in periods:
        car_time = car_dist / (CAR_SKIM_SPEED_KPH[period] / 3.6) + CAR_TERMINAL_S
        pt_time = pt_dist / (PT_SPEED_KPH / 3.6) + PT_WAIT_S[period] + PT_ACCESS_S
        for kind, mode, values in (
            ("DIST", "CAR", car_dist),
            ("TIME", "CAR", car_time),
            ("DIST", "PT", pt_dist),
            ("TIME", "PT", pt_time),
        ):
            frames.append(
                pd.DataFrame(
                    {
                        "skim_kind": kind,
                        "mode": mode,
                        "period": period,
                        "origin": oi.ravel(),
                        "destination": di.ravel(),
                        "value": np.round(values.reshape(n * n), 1),
                    }
                )
            )
    out = pd.concat(frames, ignore_index=True)
    out["source_file"] = source_file
    return out
