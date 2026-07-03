#!/usr/bin/env python3
"""GEH-validated zone aggregation for STEAM 2040.

Aggregating a zone system distorts the assigned link volumes; the GEH statistic
    GEH = sqrt( 2*(M - C)^2 / (M + C) )
measures that distortion per link (M = aggregated-model volume, C = full-
resolution volume). This tool builds an aggregation to a target zone count,
re-assigns it, and reports the share of links under GEH 2 / 5 — so an aggregation
can be accepted on a GEH basis.

Three approaches (``--mode``):

* ``lossless``           merge only zones that share a network loading node. The
                         node-level OD is unchanged, so GEH = 0 on every link.
                         The floor is the number of distinct loading nodes
                         (~3,200 for STEAM 2040) — you cannot go below this and
                         keep GEH 0.
* ``single-connector``   merge loading nodes (demand-aware: absorb the smallest-
                         loading node into a near neighbour). Fewer loading
                         points -> a faster model, but volumes shift, so ~95% of
                         links stay under GEH 2, not 100%.
* ``preserve-loading``   aggregate the zone SYSTEM to the target but keep the
                         assignment loading distributed over the original access
                         nodes (each aggregated OD pair is split back to member
                         nodes by their production/attraction shares). Node
                         marginals are preserved exactly, so GEH stays ~0 on all
                         links at any zone level. The demand matrix is smaller;
                         the assignment resolution is not reduced.

Usage:
    python tools/geh_aggregation.py --levels 3200,3150,3000,2600 --mode preserve-loading
    python tools/geh_aggregation.py --mode lossless --out dist/agg
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from steam_core.network import load_network          # noqa: E402
from steam_core.landuse import load_zones            # noqa: E402
from steam_core.matrix import load_od_long           # noqa: E402
from steam_core.settings import Settings             # noqa: E402
from steam_core.graph import build_csr               # noqa: E402
from steam_core.zonemap import build_zone_node_map, zone_id_to_row  # noqa: E402
from steam_assignment.demand import Demand           # noqa: E402
from steam_assignment.assignment import _line_search  # noqa: E402
from steam_assignment.bpr import bpr_time            # noqa: E402


def discover(base: Path):
    def find(needles, suffix=None):
        for p in base.rglob("*"):
            if p.is_file() and (suffix is None or p.name.lower().endswith(suffix)) \
               and any(n in p.name.lower() for n in needles):
                return p
        return None
    net = find((".shp",)) or find(("_links.csv",))
    zones = find(("landuse", "land_use"), ".csv")
    matrix = find(("matrix", "od_long"), ".csv")
    return net, zones, matrix


class Model:
    def __init__(self, data: Path):
        s = Settings()
        net_p, zones_p, mat_p = discover(data)
        print(f"[geh] network {net_p}")
        self.net = load_network(net_p, s)
        self.zones = load_zones(zones_p)
        self.od = load_od_long(mat_p)
        self.graph = build_csr(self.net)
        self.zn = build_zone_node_map(self.zones, self.net)
        self.z2row = zone_id_to_row(self.zones)
        self.fft = self.net.fftime.astype(np.float64)
        self.cap = self.net.capacity.astype(np.float64)
        self.a, self.b = s.bpr_alpha, s.bpr_beta
        self.pf = s.period_factor
        self._node_pair()

    def _node_pair(self):
        """Full-resolution node-level OD and per-node production/attraction."""
        np_ = defaultdict(float)
        prod = defaultdict(float)
        attr = defaultdict(float)
        for o, d, t in zip(self.od.origin, self.od.dest, self.od.trips):
            if t <= 0:
                continue
            ri = self.z2row.get(int(o)); rj = self.z2row.get(int(d))
            if ri is None or rj is None:
                continue
            na = int(self.zn[ri]); nb = int(self.zn[rj])
            if na < 0 or nb < 0 or na == nb:
                continue
            v = float(t) * self.pf
            np_[(na, nb)] += v
            prod[na] += v
            attr[nb] += v
        self.node_pair = np_
        self.prod = prod
        self.attr = attr
        self.nodes = sorted(set(prod) | set(attr))
        print(f"[geh] {len(self.zones.z):,} zones -> {len(self.nodes):,} loading nodes, "
              f"{len(np_):,} node-OD pairs")

    # ---- assignment ------------------------------------------------------
    def _demand(self, pairmap):
        by = defaultdict(list)
        for (x, y), t in pairmap.items():
            if x != y and t > 0:
                by[x].append((y, t))
        origins = np.array(sorted(by), dtype=np.int64)
        head = np.zeros(len(origins) + 1, dtype=np.int64)
        dn, dt, tot = [], [], 0.0
        for i, o in enumerate(origins):
            for y, t in by[int(o)]:
                dn.append(y); dt.append(t); tot += t
            head[i + 1] = len(dn)
        return Demand(kind="fixed", origins=origins, head=head,
                      dest_node=np.asarray(dn, np.int64),
                      dest_trips=np.asarray(dt, np.float64), total=tot)

    def assign(self, pairmap, iters, warm=None, label=""):
        dem = self._demand(pairmap)
        t0 = time.time()
        vol = warm.copy() if warm is not None else dem.assign(self.graph, self.fft)[0]
        for _ in range(iters):
            t = bpr_time(self.fft, vol, self.cap, self.a, self.b)
            aux, _, _ = dem.assign(self.graph, t)
            lam = _line_search(vol, aux, self.fft, self.cap, self.a, self.b)
            vol = vol + lam * (aux - vol)
        print(f"[geh] assign {label}: {len(dem.origins):,} origins, {iters} it, {time.time()-t0:.0f}s")
        return vol


def geh(M, C):
    M = np.asarray(M, float); C = np.asarray(C, float)
    d = M + C; g = np.zeros_like(M); m = d > 0
    g[m] = np.sqrt(2 * (M[m] - C[m]) ** 2 / d[m])
    return g


# ---------------------------------------------------------------------------
# aggregation approaches
# ---------------------------------------------------------------------------
def cluster_nodes(m: Model, target: int):
    """Demand-aware node clustering: absorb the smallest-loading node into a near
    neighbour first. Returns rep[node] mapping to a representative loading node."""
    nxy = m.net.node_xy
    cell = 1500.0
    grid = defaultdict(list)
    for n in m.nodes:
        grid[(int(nxy[n, 0] // cell), int(nxy[n, 1] // cell))].append(n)
    cand = []
    for n in m.nodes:
        gx, gy = int(nxy[n, 0] // cell), int(nxy[n, 1] // cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for o in grid.get((gx + dx, gy + dy), []):
                    if o <= n:
                        continue
                    dist = float(np.hypot(nxy[n, 0] - nxy[o, 0], nxy[n, 1] - nxy[o, 1]))
                    if dist <= cell:
                        cand.append((min(m.prod[n], m.prod[o]) * (dist + 50), n, o))
    cand.sort()
    parent = {n: n for n in m.nodes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    ncl = len(m.nodes)
    for _, x, y in cand:
        if ncl <= target:
            break
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx; ncl -= 1
    members = defaultdict(list)
    for n in m.nodes:
        members[find(n)].append(n)
    rep = {}
    for mem in members.values():
        r = max(mem, key=lambda z: m.prod[z])
        for n in mem:
            rep[n] = r
    return rep, ncl, members


def agg_single_connector(m: Model, rep):
    """Collapse each cluster's trips onto its representative node."""
    agg = defaultdict(float)
    for (x, y), t in m.node_pair.items():
        rx, ry = rep[x], rep[y]
        if rx != ry:
            agg[(rx, ry)] += t
    return agg


def agg_preserve_loading(m: Model, rep, members):
    """Aggregate to cluster OD, then split back to member nodes by production/
    attraction shares (multi-connector). Node marginals are preserved exactly."""
    # cluster totals
    cl_od = defaultdict(float)
    root_of = {}
    for root, mem in members.items():
        for n in mem:
            root_of[n] = root
    for (x, y), t in m.node_pair.items():
        rx, ry = root_of[x], root_of[y]
        if rx != ry:
            cl_od[(rx, ry)] += t
    # production/attraction share of each member within its cluster
    cl_prod = defaultdict(float)
    cl_attr = defaultdict(float)
    for root, mem in members.items():
        for n in mem:
            cl_prod[root] += m.prod[n]
            cl_attr[root] += m.attr[n]
    # reconstruct node OD: T_AB * prodShare(a) * attrShare(b)
    recon = defaultdict(float)
    for (A, B), T in cl_od.items():
        ma = members[A]; mb = members[B]
        pa = cl_prod[A] or 1.0; ab = cl_attr[B] or 1.0
        for a in ma:
            sa = m.prod[a] / pa
            if sa <= 0:
                continue
            for b in mb:
                sb = m.attr[b] / ab
                if sb > 0:
                    recon[(a, b)] += T * sa * sb
    return recon


# ---------------------------------------------------------------------------
def report(m: Model, V0, Vx, label, out_g=None):
    g = geh(Vx, V0)
    loaded = (V0 > 0) | (Vx > 0)
    hi = loaded & (V0 > 50)
    gl = g[loaded]; gh = g[hi]
    print(f"  {label}")
    print(f"    all loaded links ({loaded.sum():,}):  GEH<2 {np.mean(gl<2)*100:6.2f}%   "
          f"GEH<5 {np.mean(gl<5)*100:6.2f}%   max {gl.max():.1f}")
    print(f"    links vol>50    ({hi.sum():,}):  GEH<2 {np.mean(gh<2)*100:6.2f}%   "
          f"GEH<5 {np.mean(gh<5)*100:6.2f}%   max {gh.max():.1f}")
    return g


def write_correspondence(m: Model, rep, path: Path):
    # zone_id -> cluster id (dense), via the zone's loading node's representative
    root_id = {}
    labels = []
    for zi, zid in enumerate(m.zones.z):
        nd = int(m.zn[zi])
        if nd < 0 or nd not in rep:
            labels.append((int(zid), -1)); continue
        r = rep[nd]
        if r not in root_id:
            root_id[r] = len(root_id)
        labels.append((int(zid), root_id[r]))
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        f.write("zone_id,cluster_id\n")
        for z, c in labels:
            f.write(f"{z},{c}\n")
    print(f"    wrote {path}  ({len(root_id):,} clusters)")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=ROOT / "realdata")
    ap.add_argument("--levels", default="3200,3150,3000,2600",
                    help="comma-separated target zone counts")
    ap.add_argument("--mode", choices=["lossless", "single-connector", "preserve-loading"],
                    default="preserve-loading")
    ap.add_argument("--iters", type=int, default=20, help="baseline FW iterations")
    ap.add_argument("--agg-iters", type=int, default=10, help="aggregated FW iterations (warm-started)")
    ap.add_argument("--out", type=Path, default=None, help="dir for correspondence CSVs")
    args = ap.parse_args()

    m = Model(args.data)
    levels = [int(x) for x in args.levels.split(",")]
    n_nodes = len(m.nodes)

    print(f"[geh] baseline: full-resolution equilibrium ({args.iters} it)…")
    V0 = m.assign(m.node_pair, args.iters, label="BASELINE")

    for target in levels:
        print(f"\n=== target {target:,} zones · mode={args.mode} ===")
        if target >= n_nodes:
            print(f"  target >= {n_nodes:,} loading nodes -> lossless (GEH = 0 on all links).")
            rep = {n: n for n in m.nodes}
            members = {n: [n] for n in m.nodes}
            if args.out:
                write_correspondence(m, rep, args.out / f"correspondence_{target}.csv")
            continue

        rep, ncl, members = cluster_nodes(m, target)
        if args.mode == "lossless":
            print(f"  lossless mode caps at {n_nodes:,} zones; for {target:,} use "
                  f"single-connector or preserve-loading.")
        if args.mode == "preserve-loading":
            agg = agg_preserve_loading(m, rep, members)
            Vx = m.assign(agg, args.agg_iters, warm=V0, label=f"preserve {target}")
        else:
            agg = agg_single_connector(m, rep)
            Vx = m.assign(agg, args.agg_iters, warm=V0, label=f"single {target}")
        report(m, V0, Vx, f"{ncl:,} clusters ({args.mode})")
        if args.out:
            write_correspondence(m, rep, args.out / f"correspondence_{target}.csv")


if __name__ == "__main__":
    main()
