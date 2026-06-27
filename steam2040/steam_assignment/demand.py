"""Demand sources for the assignment.

Three sources, as in Part 2:

* a loaded long-format OD matrix (scaled by the period factor and growth),
* a land-use gravity model evaluated on the live congested skim, and
* an all-ones sanity source.

A :class:`Demand` packages whatever the chosen source needs into flat arrays
the Numba kernels consume, and exposes a single :meth:`assign` entry point that
runs one all-or-nothing load at a given per-link travel time.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from steam_core.graph import CSRGraph
from steam_core.kernels import aon_fixed, aon_gravity
from steam_core.landuse import Zones
from steam_core.matrix import ODMatrix
from steam_core.settings import Settings
from steam_core.zonemap import zone_id_to_row


@dataclass
class Demand:
    """A ready-to-assign demand, either ``"fixed"`` or ``"gravity"``."""

    kind: str
    # fixed
    origins: np.ndarray = None
    head: np.ndarray = None
    dest_node: np.ndarray = None
    dest_trips: np.ndarray = None
    # gravity
    origin_nodes: np.ndarray = None
    origin_prod: np.ndarray = None
    zone_nodes: np.ndarray = None
    zone_attr: np.ndarray = None
    beta: float = 0.1
    total: float = 0.0

    def assign(self, graph: CSRGraph, link_time: np.ndarray):
        """Run one all-or-nothing load; return ``(link_volume, sptt, total)``."""
        graph.set_weights_from_link_time(link_time)
        if self.kind == "fixed":
            edge_flow, sptt = aon_fixed(
                graph.indptr, graph.indices, graph.weight, graph.n_nodes,
                self.origins, self.head, self.dest_node, self.dest_trips)
            total = self.total
        elif self.kind == "gravity":
            edge_flow, sptt, total = aon_gravity(
                graph.indptr, graph.indices, graph.weight, graph.n_nodes,
                self.origin_nodes, self.origin_prod, self.zone_nodes,
                self.zone_attr, self.beta)
        else:
            raise ValueError(f"unknown demand kind {self.kind!r}")
        return graph.link_volume_from_edges(edge_flow), sptt, total


def _sample_origins(n: int, sample: int, seed: int):
    """Return (indices, scale) for an origin sample, or (all, 1.0)."""
    if sample <= 0 or sample >= n:
        return np.arange(n), 1.0
    rng = np.random.default_rng(seed)
    idx = np.sort(rng.choice(n, size=sample, replace=False))
    return idx, n / sample


def build_fixed_demand(od: ODMatrix, zones: Zones, zone_node: np.ndarray,
                       settings: Settings, hgv: ODMatrix | None = None) -> Demand:
    """Group a long OD matrix by origin node, apply period factor + scale.

    Intrazonal cells and pairs that collapse onto a single node are dropped.
    An optional HGV matrix is folded in at the PCE factor.
    """
    z2row = zone_id_to_row(zones)
    factor = settings.period_factor * settings.demand_scale

    # Accumulate trips per (origin_node, dest_node).
    pair_trips: dict[tuple[int, int], float] = {}

    def add(matrix: ODMatrix, pce: float):
        for o, d, t in zip(matrix.origin, matrix.dest, matrix.trips):
            if t <= 0 or o == d:
                continue
            ri = z2row.get(int(o))
            rj = z2row.get(int(d))
            if ri is None or rj is None:
                continue
            on = zone_node[ri]
            dn = zone_node[rj]
            if on < 0 or dn < 0 or on == dn:
                continue
            key = (int(on), int(dn))
            pair_trips[key] = pair_trips.get(key, 0.0) + float(t) * pce * factor

    add(od, 1.0)
    if hgv is not None:
        add(hgv, settings.hgv_pce)

    # Group by origin node.
    by_origin: dict[int, list[tuple[int, float]]] = {}
    for (on, dn), t in pair_trips.items():
        by_origin.setdefault(on, []).append((dn, t))

    all_origins = np.array(sorted(by_origin), dtype=np.int64)
    sel, scale = _sample_origins(len(all_origins), settings.origin_sample,
                                 settings.random_seed)
    origins = all_origins[sel]

    head = np.zeros(len(origins) + 1, dtype=np.int64)
    dest_node_list: list[int] = []
    dest_trips_list: list[float] = []
    total = 0.0
    for i, on in enumerate(origins):
        dests = by_origin[int(on)]
        for dn, t in dests:
            ts = t * scale
            dest_node_list.append(dn)
            dest_trips_list.append(ts)
            total += ts
        head[i + 1] = len(dest_node_list)

    return Demand(
        kind="fixed", origins=origins, head=head,
        dest_node=np.asarray(dest_node_list, dtype=np.int64),
        dest_trips=np.asarray(dest_trips_list, dtype=np.float64),
        total=total,
    )


def productions(zones: Zones, settings: Settings) -> np.ndarray:
    return (settings.rate_pop * zones.pop_tot
            + settings.rate_wkr * zones.worker
            + settings.rate_stu * zones.student).astype(np.float64)


def attractions(zones: Zones, settings: Settings) -> np.ndarray:
    return ((settings.attr_retail * zones.retail_gfa
             + settings.attr_office * zones.office_gfa
             + settings.attr_industrial * zones.ind_gfa
             + settings.attr_school * zones.school_gfa) / 100.0).astype(np.float64)


def build_gravity_demand(zones: Zones, zone_node: np.ndarray,
                         settings: Settings) -> Demand:
    """Build a production-constrained gravity demand (evaluated live on skim)."""
    prod = productions(zones, settings) * settings.period_factor * settings.demand_scale
    attr = attractions(zones, settings)

    valid = zone_node >= 0
    prod_mask = valid & (prod > 0)
    attr_mask = valid & (attr > 0)

    all_idx = np.where(prod_mask)[0]
    sel, scale = _sample_origins(len(all_idx), settings.origin_sample,
                                 settings.random_seed)
    oidx = all_idx[sel]

    return Demand(
        kind="gravity",
        origin_nodes=zone_node[oidx].astype(np.int64),
        origin_prod=(prod[oidx] * scale).astype(np.float64),
        zone_nodes=zone_node[attr_mask].astype(np.int64),
        zone_attr=attr[attr_mask].astype(np.float64),
        beta=settings.deterrence_beta,
        total=float((prod[oidx] * scale).sum()),
    )


def build_allones_demand(zones: Zones, zone_node: np.ndarray) -> Demand:
    """One trip from every zone to every other zone (engine sanity check)."""
    nodes = zone_node[zone_node >= 0].astype(np.int64)
    nodes = np.unique(nodes)
    origins = nodes
    head = np.arange(len(origins) + 1, dtype=np.int64) * len(nodes)
    dest_node = np.tile(nodes, len(origins))
    dest_trips = np.ones(len(dest_node), dtype=np.float64)
    return Demand(kind="fixed", origins=origins, head=head,
                  dest_node=dest_node, dest_trips=dest_trips,
                  total=float(len(dest_node)))
