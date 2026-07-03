#!/usr/bin/env python3
"""Build the single-file STEAM 2040 Studio HTML.

Loads the real STEAM network + land-use + OD matrix with the project's own
loaders, packs everything into a compact binary blob (gzip + base64), and inlines
the JS engine, the WebGL map and the app controller into one self-contained
``.html`` file that runs offline from a double-click — no server, no install.

The data is baked **locally**; nothing here writes the confidential STEAM data
into the repository. Point ``--data`` at the folder holding the shapefile,
``STEAM_landuse_2040.csv`` and the long OD CSV (defaults to ``realdata/``), and
the generated HTML lands wherever ``--out`` says.

Usage:
    python tools/build_html.py                       # uses realdata/ -> dist/
    python tools/build_html.py --data /path --out x.html
    python tools/build_html.py --sample              # tiny synthetic demo data
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from steam_core.network import load_network          # noqa: E402
from steam_core.landuse import load_zones, Zones     # noqa: E402
from steam_core.matrix import load_od_long, ODMatrix  # noqa: E402
from steam_core.settings import Settings             # noqa: E402

STANDALONE = ROOT / "standalone"

# numpy dtype -> the little-endian tag decodeBlob() understands
DTYPE_TAG = {
    np.dtype("int32"): "<i4", np.dtype("float32"): "<f4",
    np.dtype("uint8"): "|u1", np.dtype("int16"): "<i2",
    np.dtype("float64"): "<f8",
}


# ---------------------------------------------------------------------------
# data discovery
# ---------------------------------------------------------------------------
def _find(base: Path, needles, suffix=None):
    for p in base.rglob("*"):
        if not p.is_file():
            continue
        name = p.name.lower()
        if suffix and not name.endswith(suffix):
            continue
        if any(nd in name for nd in needles):
            return p
    return None


def discover(base: Path):
    net = _find(base, (".shp",)) or _find(base, ("network_links.csv", "_links.csv"))
    zones = _find(base, ("landuse", "land_use"), suffix=".csv")
    matrix = (_find(base, ("matrix", "od_long", "long_od"), suffix=".csv")
              or _find(base, ("_od.csv", "od.csv"), suffix=".csv"))
    return net, zones, matrix


# ---------------------------------------------------------------------------
# blob packing
# ---------------------------------------------------------------------------
class Packer:
    """Concatenates named typed-array sections and records byte offsets."""

    def __init__(self):
        self.sections: dict[str, dict] = {}
        self.chunks: list[bytes] = []
        self.offset = 0

    def add(self, name: str, arr: np.ndarray, dtype):
        a = np.ascontiguousarray(arr, dtype=dtype)
        raw = a.tobytes()
        self.sections[name] = {
            "dtype": DTYPE_TAG[np.dtype(dtype)],
            "offset": self.offset,
            "len": len(raw),          # bytes (decodeBlob slices by byte range)
        }
        self.chunks.append(raw)
        self.offset += len(raw)

    def blob(self, header_meta: dict) -> bytes:
        header = dict(header_meta)
        header["sections"] = self.sections
        hjson = json.dumps(header, separators=(",", ":")).encode("utf-8")
        body = b"".join(self.chunks)
        return struct.pack("<I", len(hjson)) + hjson + body


def compute_baseline(net, zones, od, iters=15, sample=0):
    """Run a correct full-origin Frank-Wolfe equilibrium in Python and return the
    per-link volume, to bake into the file as the displayed baseline.

    In-browser origin sampling distorts the flow pattern (it scales a random
    subset of origins up, over-loading their corridors), so the honest result is
    computed here once with every origin loaded (``sample=0``).
    """
    if zones is None or zones.n == 0 or od is None or od.n_pairs == 0:
        return None
    try:
        from steam_core.graph import build_csr
        from steam_core.zonemap import build_zone_node_map
        from steam_assignment.demand import build_fixed_demand
        from steam_assignment.assignment import assign
    except Exception as exc:  # pragma: no cover
        print(f"[build] baseline skipped (import): {exc}")
        return None
    s = Settings()
    s.origin_sample = sample
    s.fw_max_iter = iters
    graph = build_csr(net)
    zn = build_zone_node_map(zones, net)
    dem = build_fixed_demand(od, zones, zn, s)
    t = _now()
    res = assign(net, graph, dem, s, "Frank-Wolfe UE")
    gap = res.gap_history[-1] if res.gap_history else float("nan")
    over = int(np.sum(res.vc > 1))
    print(f"[build] baseline FW: {len(dem.origins):,} origins, {iters} iters, "
          f"gap {gap:.2e}, {over:,} links over capacity ({_dt(t):.0f}s)")
    return res.volume.astype(np.float32)


def _now():
    import time
    return time.time()


def _dt(t):
    import time
    return time.time() - t


def build_blob(net, zones: Zones | None, od: ODMatrix | None, base_volume=None):
    # --- recenter geometry to local metres (keeps float32 precision) --------
    gx = net.geom_xy.astype(np.float64)
    xmin, ymin = float(gx[:, 0].min()), float(gx[:, 1].min())
    xmax, ymax = float(gx[:, 0].max()), float(gx[:, 1].max())
    origin = (xmin, ymin)

    def local(xy):
        out = np.asarray(xy, dtype=np.float64).copy()
        out[:, 0] -= xmin
        out[:, 1] -= ymin
        return out

    p = Packer()
    n_links = net.n_links
    n_nodes = net.n_nodes

    # links
    p.add("klass", net.klass, np.uint8)
    p.add("lanes", np.maximum(1, net.lanes), np.int16)
    p.add("length", net.length, np.float32)
    p.add("oneway", net.oneway.astype(np.uint8), np.uint8)
    p.add("node_a", net.node_a, np.int32)
    p.add("node_b", net.node_b, np.int32)
    # nodes (interleaved x,y)
    p.add("node_xy", local(net.node_xy).reshape(-1), np.float32)
    # geometry
    p.add("geom_off", net.geom_off, np.int32)
    p.add("geom_xy", local(net.geom_xy).reshape(-1), np.float32)

    n_zones = 0
    n_od = 0
    if zones is not None and zones.n > 0:
        n_zones = zones.n
        cen = np.column_stack([zones.centroidx, zones.centroidy]).astype(np.float64)
        # preserve the (0,0) "no centroid" sentinel; recenter the rest
        missing = (cen[:, 0] == 0) & (cen[:, 1] == 0)
        loc = cen.copy()
        loc[:, 0] -= xmin
        loc[:, 1] -= ymin
        loc[missing] = 0.0
        p.add("z_centroid", loc.reshape(-1), np.float32)
        for name, col in (
            ("z_pop_tot", zones.pop_tot), ("z_worker", zones.worker),
            ("z_student", zones.student), ("z_hh", zones.hh),
            ("z_retail_gfa", zones.retail_gfa), ("z_office_gfa", zones.office_gfa),
            ("z_ind_gfa", zones.ind_gfa), ("z_school_gfa", zones.school_gfa),
            ("z_metro_access", zones.metro_access),
        ):
            p.add(name, col, np.float32)
        # district codes -> dense ints for the aggregation barrier key
        _, dcode = np.unique(zones.district, return_inverse=True)
        p.add("z_district", dcode.astype(np.int32), np.int32)

        # OD: map zone ids -> row indices the engine uses
        if od is not None and od.n_pairs > 0:
            id2row = {int(z): i for i, z in enumerate(zones.z)}
            oi = np.fromiter((id2row.get(int(o), -1) for o in od.origin),
                             dtype=np.int32, count=od.n_pairs)
            di = np.fromiter((id2row.get(int(d), -1) for d in od.dest),
                             dtype=np.int32, count=od.n_pairs)
            keep = (oi >= 0) & (di >= 0) & (od.trips > 0)
            oi, di, tr = oi[keep], di[keep], od.trips[keep].astype(np.float32)
            n_od = int(keep.sum())
            p.add("od_o", oi, np.int32)
            p.add("od_d", di, np.int32)
            p.add("od_t", tr, np.float32)

    # baked correct baseline assignment (full-origin equilibrium)
    has_baseline = False
    if base_volume is not None and len(base_volume) == n_links:
        p.add("base_volume", np.asarray(base_volume, np.float32), np.float32)
        has_baseline = True

    header = {
        "n_links": int(n_links), "n_nodes": int(n_nodes),
        "n_zones": int(n_zones), "n_od": int(n_od),
        "has_baseline": has_baseline,
        "bounds": [0.0, 0.0, xmax - xmin, ymax - ymin],
    }
    blob = p.blob(header)
    header["sections"] = p.sections
    return blob, origin, header


# ---------------------------------------------------------------------------
# JS inlining (strip ES module import/export so it runs as a classic script)
# ---------------------------------------------------------------------------
def strip_module(src: str) -> str:
    out = []
    for line in src.splitlines():
        s = line.strip()
        if s.startswith("import ") and " from " in s:
            continue
        if s.startswith("export {") or s.startswith("export default"):
            continue
        line = line.replace("export async function", "async function")
        line = line.replace("export function", "function")
        line = line.replace("export class", "class")
        line = line.replace("export const", "const")
        out.append(line)
    return "\n".join(out)


def build_html(blob: bytes, origin, header) -> str:
    b64 = base64.b64encode(gzip.compress(blob, 6)).decode("ascii")
    engine = strip_module((STANDALONE / "engine.js").read_text())
    glmap = strip_module((STANDALONE / "glmap.js").read_text())
    app = strip_module((STANDALONE / "app.js").read_text())
    tmpl = (STANDALONE / "template.html").read_text()
    return (tmpl
            .replace("__BLOB__", b64)
            .replace("__ORIGIN__", json.dumps([origin[0], origin[1]]))
            .replace("__ENGINE__", engine)
            .replace("__GLMAP__", glmap)
            .replace("__APP__", app))


# ---------------------------------------------------------------------------
# synthetic sample (safe to publish)
# ---------------------------------------------------------------------------
def sample_inputs():
    """A tiny grid network + zones + OD, for a demo HTML with no real data."""
    from steam_core.network import _assemble
    rng = np.random.default_rng(7)
    G = 12          # 12x12 grid of nodes
    step = 800.0
    rows, geoms = [], []
    lid = 0
    coord = lambda i, j: (i * step, j * step)
    for i in range(G):
        for j in range(G):
            for di, dj in ((1, 0), (0, 1)):
                ni, nj = i + di, j + dj
                if ni >= G or nj >= G:
                    continue
                a = i * G + j
                b = ni * G + nj
                ax, ay = coord(i, j)
                bx, by = coord(ni, nj)
                edge = i in (0, G - 1) or j in (0, G - 1)
                klass = 0 if (i == G // 2 or j == G // 2) else (2 if edge else 3)
                rows.append({"link_id": lid, "raw_a": a, "raw_b": b,
                             "klass": klass, "ltype": 0,
                             "lanes": 3 if klass == 0 else 2 if klass == 2 else 1,
                             "length": step, "oneway": False})
                geoms.append(np.array([[ax, ay], [bx, by]], dtype=np.float64))
                lid += 1
    net = _assemble(rows, geoms)
    net.recompute_costs(Settings())

    nz = G * G
    z = np.arange(1, nz + 1)
    cx = np.array([(k // G) * step for k in range(nz)], dtype=np.float64)
    cy = np.array([(k % G) * step for k in range(nz)], dtype=np.float64)
    pop = rng.integers(200, 4000, nz).astype(np.float64)
    job = rng.integers(100, 5000, nz).astype(np.float64)

    def col(v):
        return np.asarray(v, dtype=np.float64)
    zeros = np.zeros(nz)
    zones = Zones(
        z=z, district=(z % 6), distname=[f"D{c%6}" for c in z],
        areatype=zeros, areatype2=zeros, urban_rura=zeros,
        metro_area=zeros, metro_access=(z % 3), reg=zeros, prodsector=zeros,
        freight=zeros, lu_class=zeros, shapearea=zeros + step * step,
        pop_tot=pop, hh=pop / 3, worker=job, student=pop / 4, labourer=job / 2,
        gfa_total=job * 20, res_gfa=pop * 30, retail_gfa=job * 5,
        office_gfa=job * 8, ind_gfa=job * 3, school_gfa=pop * 2,
        med_gfa=zeros, other_gfa=zeros, activity=pop + job,
        centroidx=cx, centroidy=cy)

    o, d, t = [], [], []
    for oi in range(nz):
        for di in rng.choice(nz, 8, replace=False):
            if oi == di:
                continue
            o.append(int(z[oi]))
            d.append(int(z[di]))
            t.append(float(rng.integers(5, 120)))
    od = ODMatrix(np.array(o), np.array(d), np.array(t, dtype=np.float64))
    return net, zones, od


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=ROOT / "realdata",
                    help="folder with the STEAM shapefile + landuse + OD CSVs")
    ap.add_argument("--out", type=Path, default=None,
                    help="output .html path")
    ap.add_argument("--sample", action="store_true",
                    help="build from synthetic demo data (no confidential files)")
    ap.add_argument("--no-baseline", action="store_true",
                    help="skip baking the pre-computed full-origin equilibrium")
    ap.add_argument("--baseline-iters", type=int, default=15,
                    help="Frank-Wolfe iterations for the baked baseline")
    args = ap.parse_args()

    if args.sample:
        print("[build] generating synthetic demo network…")
        net, zones, od = sample_inputs()
        out = args.out or (ROOT / "dist" / "STEAM2040Studio_demo.html")
    else:
        base = args.data
        if not base.exists():
            sys.exit(f"data folder not found: {base}")
        net_p, zones_p, mat_p = discover(base)
        if not net_p:
            sys.exit(f"no network shapefile/CSV found under {base}")
        print(f"[build] network : {net_p}")
        net = load_network(net_p, Settings())
        zones = od = None
        if zones_p:
            print(f"[build] land-use: {zones_p}")
            zones = load_zones(zones_p)
        if mat_p:
            print(f"[build] matrix  : {mat_p}")
            od = load_od_long(mat_p)
        out = args.out or (ROOT / "dist" / "STEAM2040Studio.html")

    print(f"[build] links={net.n_links:,} nodes={net.n_nodes:,} "
          f"zones={zones.n if zones else 0:,} od={od.n_pairs if od else 0:,}")
    base_volume = None
    if not args.no_baseline:
        # demo data is tiny -> quick; real data uses full origins (correct)
        iters = 8 if args.sample else args.baseline_iters
        print("[build] computing correct full-origin baseline equilibrium…")
        base_volume = compute_baseline(net, zones, od, iters=iters, sample=0)
    blob, origin, header = build_blob(net, zones, od, base_volume=base_volume)
    print(f"[build] blob raw {len(blob)/1e6:.1f} MB · "
          f"sections={len(header['sections'])} · n_od={header['n_od']:,}")
    html = build_html(blob, origin, header)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(f"[build] wrote {out}  ({len(html)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
