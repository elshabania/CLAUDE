"""Import the recovered STEAM v3.2.2 network, zones, land use and OD matrix.

Source data (``steam-ai/reference/steam_v322``) was produced in earlier STEAM
2040 Studio sessions from the ITC STEAM v3.2.2 inputs:

* ``network_2025_2040.bin.gz``: the highway network for both years, derived
  from the network shapefile ``v322_AD_20250606_v19``. One record per directed
  link: original A and B node numbers, a year-presence flag (bit 1 = 2025,
  bit 2 = 2040), lanes and ``LTYPE`` code per year, and the polyline in
  WGS 1984 UTM Zone 40N, rounded to the metre.
* ``studio_2040/``: typed-array blobs derived from ``STEAM_landuse_2040.csv``
  (6,000 zones, centroid, district and land-use attributes) and the 24-hour
  OD matrix in long format (3,685 routable zones).

This module turns them into export directories that meet the STEAM-AI export
contract (docs/data_contract.md 8.1), one per year, so the ordinary ingest and
check pipeline processes them. Nothing is invented: tables the source does not
hold (assignment outputs, transit, skims, convergence) are simply not written,
and the checks that need them report as skipped.

Choices, all recorded in the sentinel notes:

* Links with ``LTYPE`` 60 and above (protected, non-road types such as rail)
  are left out of the highway links table; the count is reported.
* Link class follows the facility bands the earlier studio used; capacity is
  lanes times the class capacity per lane, free-flow speed is the class speed.
  ``LTYPE`` 0 is kept as class ``UNK`` with no capacity or speed, so the data
  checks can flag it.
* The one-way flags were not recovered. A link is marked two-way when its
  opposite direction is coded in the same year; otherwise its direction is
  unknown (null), so no one-way error is asserted from missing information.
* Sector and area type of a link come from the nearest zone centroid.
* Link ids are the record number in the dual-year table, so the same link has
  the same id in 2025 and 2040 and the two runs compare link by link.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import struct
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from .. import schema

SOURCE_CRS = "EPSG:32640"  # WGS 1984 UTM Zone 40N (the .prj of the STEAM shapefiles)
STEAM_VERSION = "3.2.2"
NETWORK_FILE = "network_2025_2040.bin.gz"
STUDIO_DIR = "studio_2040"

# Facility classes: (code, capacity veh/h/lane, free-flow km/h). Values are the
# defaults the STEAM 2040 Studio documented for the v3.2.2 network.
CLASSES = {
    "FWY": (2000, 100), "RAMP": (1500, 60), "ART": (900, 60), "COL": (700, 50),
    "RUR": (600, 80), "LOC": (500, 30), "JUNC": (600, 30),
}
NONROAD_FROM = 60  # LTYPE >= 60: protected / non-road types


def link_class(ltype: int) -> str | None:
    """STEAM LTYPE code to STEAM-AI link class; None for non-road links."""
    if ltype >= NONROAD_FROM:
        return None
    if 1 <= ltype <= 9:
        return "FWY"
    if 10 <= ltype <= 19:
        return "RAMP"
    if 20 <= ltype <= 21:
        return "ART"
    if 22 <= ltype <= 27:
        return "COL"
    if 28 <= ltype <= 29:
        return "LOC"
    if 30 <= ltype <= 39:
        return "RUR"
    if 40 <= ltype <= 59:
        return "JUNC"
    return "UNK"


@dataclass
class DualYearNetwork:
    a: np.ndarray
    b: np.ndarray
    flags: np.ndarray
    lanes: dict[int, np.ndarray]
    ltype: dict[int, np.ndarray]
    offsets: np.ndarray  # vertex offsets into xy, length n + 1
    xy: np.ndarray  # (n_vertices, 2) UTM metres

    @property
    def n(self) -> int:
        return len(self.a)

    def in_year(self, year: int) -> np.ndarray:
        bit = {2025: 1, 2040: 2}[year]
        return (self.flags & bit) > 0


def read_dual_year(path: Path) -> DualYearNetwork:
    raw = gzip.open(path).read()
    n = struct.unpack_from("<I", raw, 0)[0]
    p = 4
    a = np.empty(n, np.int64)
    b = np.empty(n, np.int64)
    fl = np.empty(n, np.uint8)
    n25 = np.empty(n, np.int16)
    n40 = np.empty(n, np.int16)
    t25 = np.empty(n, np.int16)
    t40 = np.empty(n, np.int16)
    offsets = np.zeros(n + 1, np.int64)
    chunks: list[np.ndarray] = []
    head = struct.Struct("<iiBBBhhH")
    for k in range(n):
        a[k], b[k], fl[k], n25[k], n40[k], t25[k], t40[k], npts = head.unpack_from(raw, p)
        p += head.size
        chunks.append(np.frombuffer(raw, dtype="<i4", count=2 * npts, offset=p))
        p += 8 * npts
        offsets[k + 1] = offsets[k] + npts
    if p != len(raw):
        raise ValueError(f"{path}: decoded {p} of {len(raw)} bytes; format mismatch")
    xy = np.concatenate(chunks).astype(np.float64).reshape(-1, 2)
    return DualYearNetwork(a, b, fl, {2025: n25, 2040: n40}, {2025: t25, 2040: t40},
                           offsets, xy)


@dataclass
class Studio2040:
    meta: dict
    zones: pd.DataFrame  # zone_id, x, y (UTM), int attributes
    land_use: pd.DataFrame  # zone_id, variable, value
    od: pd.DataFrame  # origin, destination, trips


def _blob(folder: Path, name: str, dtype: str) -> np.ndarray:
    return np.frombuffer(gzip.open(folder / f"{name}.gz").read(), dtype=dtype)


def read_studio(folder: Path) -> Studio2040:
    meta = json.loads((folder / "meta.json").read_text("utf-8"))
    nz = int(meta["counts"]["zones"])
    xy = _blob(folder, "zone_xy.f32", "<f4").reshape(-1, 2)[:nz]
    attr = _blob(folder, "zone_attr.f32", "<f4").reshape(len(meta["attrNames"]), nz)
    ints = _blob(folder, "zone_int.i16", "<i2").reshape(len(meta["intNames"]), nz)
    zones = pd.DataFrame({"zone_id": np.arange(1, nz + 1), "x": xy[:, 0].astype(float),
                          "y": xy[:, 1].astype(float)})
    for k, name in enumerate(meta["intNames"]):
        zones[name] = ints[k].astype(int)
    zones = zones[(zones["x"] != 0) | (zones["y"] != 0)].reset_index(drop=True)
    names = {"POP_TOT": "POP"}
    lu_parts = []
    for k, name in enumerate(meta["attrNames"]):
        if name == "SHAPEAREA":
            continue
        col = attr[k]
        lu_parts.append(pd.DataFrame({"zone_id": np.arange(1, nz + 1),
                                      "variable": names.get(name, name),
                                      "value": col.astype(float)}))
    land_use = pd.concat(lu_parts, ignore_index=True)
    land_use = land_use[land_use["zone_id"].isin(zones["zone_id"])].reset_index(drop=True)
    off = _blob(folder, "matrix_off.i32", "<i4").astype(np.int64)
    dest = _blob(folder, "matrix_dest.u16", "<u2").astype(np.int64)
    trips = _blob(folder, "matrix_trips.f32", "<f4").astype(float)
    origin = np.repeat(np.arange(1, len(off)), np.diff(off))
    od = pd.DataFrame({"origin": origin, "destination": dest, "trips": trips})
    return Studio2040(meta, zones, land_use, od)


def _to_wgs84(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    from pyproj import Transformer

    tr = Transformer.from_crs(SOURCE_CRS, "EPSG:4326", always_xy=True)
    lon, lat = tr.transform(x, y)
    return np.asarray(lon), np.asarray(lat)


def _linestrings(lon: np.ndarray, lat: np.ndarray, offsets: np.ndarray) -> list[str]:
    pts = np.char.add(np.char.add(np.round(lon, 6).astype(str), " "),
                      np.round(lat, 6).astype(str))
    return ["LINESTRING (" + ", ".join(pts[offsets[i]:offsets[i + 1]]) + ")"
            for i in range(len(offsets) - 1)]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _write(out: Path, name: str, df: pd.DataFrame, source_file: str,
           source_row: np.ndarray | None = None) -> int:
    sch = schema.TABLES[name]
    df = df.copy()
    df["source_file"] = source_file
    if "source_row" in sch.names:
        df["source_row"] = (np.arange(1, len(df) + 1) if source_row is None
                            else np.asarray(source_row))
    for f in sch:
        if f.name not in df.columns:
            df[f.name] = None
    df[sch.names].to_csv(out / schema.EXPORT_TABLE_FILES[name], index=False,
                         lineterminator="\n", float_format="%.6g")
    return len(df)


def build_export(ref_dir: Path, out_dir: Path, year: int, *,
                 network: DualYearNetwork | None = None,
                 studio: Studio2040 | None = None) -> Path:
    """Write one STEAM-AI export directory for ``year`` (2025 or 2040)."""
    t0 = time.perf_counter()
    ref_dir, out_dir = Path(ref_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    net = network or read_dual_year(ref_dir / NETWORK_FILE)
    st = studio or read_studio(ref_dir / STUDIO_DIR)
    district_names = {int(k): v for k, v in st.meta.get("districts", {}).items()}
    net_src = f"{NETWORK_FILE} (v322_AD_20250606_v19, {year} fields)"

    # ---- links ------------------------------------------------------------------
    present = np.flatnonzero(net.in_year(year))
    ltypes = net.ltype[year][present].astype(int)
    classes = np.array([link_class(t) for t in ltypes], dtype=object)
    road = np.array([c is not None for c in classes])
    n_nonroad = int((~road).sum())
    idx = present[road]
    classes = classes[road]
    ltypes = ltypes[road]
    lanes = net.lanes[year][idx].astype(int)
    a, b = net.a[idx], net.b[idx]
    offs = net.offsets
    starts, ends = offs[idx], offs[idx + 1]
    vert_idx = np.concatenate([np.arange(s, e) for s, e in zip(starts, ends, strict=True)])
    sub_off = np.concatenate([[0], np.cumsum(ends - starts)])
    xy = net.xy[vert_idx]
    seg = np.hypot(np.diff(xy[:, 0]), np.diff(xy[:, 1]))
    within = np.ones(len(seg), bool)
    within[sub_off[1:-1] - 1] = False  # drop the jumps between consecutive links
    csum = np.concatenate([[0.0], np.cumsum(np.where(within, seg, 0.0))])
    length_m = csum[sub_off[1:] - 1] - csum[sub_off[:-1]]
    lon, lat = _to_wgs84(xy[:, 0], xy[:, 1])
    pair = set(zip(a.tolist(), b.tolist(), strict=True))
    # The recovered data lost the one-way flags (LT/LN/LI_OWAY). A link whose
    # opposite direction is coded is certainly two-way; for a single record the
    # direction is unknown (dead-end streets split evenly between "in only" and
    # "out only", so single records are not reliably one-way). Unknown -> null.
    two_way = np.array([(bb, aa) in pair for aa, bb in zip(a.tolist(), b.tolist(), strict=True)])
    oneway = np.where(two_way, False, None)
    cap = np.array([np.nan if c == "UNK" else CLASSES[c][0] for c in classes]) * lanes
    ffs = np.array([np.nan if c == "UNK" else CLASSES[c][1] for c in classes], float)

    zones = st.zones
    from scipy.spatial import cKDTree

    tree = cKDTree(zones[["x", "y"]].to_numpy())
    mid = xy[(sub_off[:-1] + sub_off[1:] - 1) // 2]
    _, near = tree.query(mid)
    near_z = zones.iloc[near]
    links = pd.DataFrame({
        "link_id": idx + 1, "a_node": a, "b_node": b, "length_m": length_m,
        "link_class": classes, "area_type": "AT" + near_z["AREATYPE"].astype(str).to_numpy(),
        "lanes": lanes, "capacity_vph": cap, "ffs_kph": ffs, "oneway": oneway,
        "toll_point": False, "junction_type": None, "ltype": ltypes,
        "sector_id": [district_names.get(int(d), f"D{int(d)}") for d in near_z["DISTRICT"]],
        "geometry_wkt": _linestrings(lon, lat, sub_off),
    })

    # ---- nodes (from link end points) ---------------------------------------------
    first = xy[sub_off[:-1]]
    last = xy[sub_off[1:] - 1]
    ends_df = pd.DataFrame({"node_id": np.concatenate([a, b]),
                            "x": np.concatenate([first[:, 0], last[:, 0]]),
                            "y": np.concatenate([first[:, 1], last[:, 1]])})
    nodes = ends_df.drop_duplicates("node_id").sort_values("node_id").reset_index(drop=True)
    nlon, nlat = _to_wgs84(nodes["x"].to_numpy(), nodes["y"].to_numpy())
    nodes = pd.DataFrame({"node_id": nodes["node_id"], "x": nlon, "y": nlat,
                          "is_centroid": False, "junction_control": None})

    # ---- zones ------------------------------------------------------------------
    zlon, zlat = _to_wgs84(zones["x"].to_numpy(), zones["y"].to_numpy())
    zones_out = pd.DataFrame({
        "zone_id": zones["zone_id"],
        "sector_id": [district_names.get(int(d), f"D{int(d)}") for d in zones["DISTRICT"]],
        "district": [district_names.get(int(d), f"D{int(d)}") for d in zones["DISTRICT"]],
        "region": "UR" + zones["URBAN_RURA"].astype(str),
        "geometry_wkt": None, "centroid_x": zlon, "centroid_y": zlat,
    })

    counts = {
        "links": _write(out_dir, "links", links, net_src, source_row=idx + 1),
        "nodes": _write(out_dir, "nodes", nodes, net_src),
        "zones": _write(out_dir, "zones", zones_out, "STEAM_landuse_2040.csv (zone_xy, zone_int)",
                        source_row=zones_out["zone_id"].to_numpy()),
    }
    notes = [
        f"Highway network for {year} from v322_AD_20250606_v19 (LINK_{year}, LANE_{year}, "
        f"LTYPE_{year}): {len(links):,} directed links, {len(nodes):,} nodes.",
        "Capacity and free-flow speed are class defaults (lanes x capacity per lane).",
        "One-way flags were not recovered: links with both directions coded are two-way, "
        "all others have unknown direction, so one-way dead-end checks do not apply.",
        "No centroid connectors, transit lines or STEAM assignment outputs were available: "
        "checks that need them are skipped.",
    ]
    if n_nonroad:
        notes.insert(1, f"{n_nonroad:,} links with LTYPE {NONROAD_FROM} or above (non-road) are "
                        "not in the highway links table.")
    if year == 2040:
        lu = st.land_use
        counts["land_use"] = _write(out_dir, "land_use", lu, "STEAM_landuse_2040.csv",
                                    source_row=lu["zone_id"].to_numpy())
        od = st.od.assign(matrix_kind="DEMAND", purpose="ALL", mode="ALL", period="DAILY")
        counts["od"] = _write(out_dir, "od", od, "STEAM_matrix_long.csv (24-hour total)")
        notes.append(f"Land use for {st.zones.shape[0]:,} zones and the 24-hour OD matrix "
                     f"({len(od):,} non-zero cells, {od['trips'].sum():,.0f} trips) are the "
                     "2040 STEAM inputs.")
    else:
        notes.append("Land use and demand for 2025 were not recovered; zones carry "
                     "centroids and districts only.")

    files = []
    for p in sorted(out_dir.iterdir()):
        if p.name == schema.EXPORT_SENTINEL or not p.is_file():
            continue
        files.append({"path": p.name, "size": p.stat().st_size, "sha256": _sha256(p)})
    sentinel = {
        "scenario_name": f"STEAM_V322_{year}",
        "horizon_year": year,
        "policy_set": "REF",
        "steam_version": STEAM_VERSION,
        "is_synthetic": False,
        "provenance": (f"STEAM v{STEAM_VERSION} {year} inputs (network, zones"
                       + (", land use, OD" if year == 2040 else "")
                       + "); no STEAM outputs"),
        "notes": notes,
        "exported_at": datetime.now(UTC).isoformat(),
        "exporter": "steam_ai.importers.steam_v322",
        "export_seconds": round(time.perf_counter() - t0, 1),
        "tables": counts,
        "files": files,
    }
    (out_dir / schema.EXPORT_SENTINEL).write_text(json.dumps(sentinel, indent=2), "utf-8")
    return out_dir


def build_both(ref_dir: Path, out_root: Path) -> dict[int, Path]:
    """Write the 2025 and 2040 exports, reading the source blobs once."""
    net = read_dual_year(Path(ref_dir) / NETWORK_FILE)
    st = read_studio(Path(ref_dir) / STUDIO_DIR)
    return {y: build_export(ref_dir, Path(out_root) / f"STEAM_V322_{y}", y, network=net,
                            studio=st) for y in (2025, 2040)}
