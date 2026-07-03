"""Generate small synthetic STEAM-format data for development and tests.

Produces, matching the Part 1 schemas:

* ``sample_network.shp`` (+ .dbf/.shx) — a grid road network with the required
  DBF fields (OBJECTID, A, B, LINK_2040, LTYPE_2040, LANE_2040, SHAPE_Leng,
  RAIL, LT40_OWAY) and realistic facility-class banding.
* ``sample_landuse.csv`` — one row per zone, all 29 columns.
* ``sample_od.csv`` — a long-format OD matrix over the zones.

Run: ``python -m tools.make_sample_data [outdir] [grid]``
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path


def _rng(seed: int):
    """Tiny deterministic LCG so sample data is reproducible without numpy."""
    state = seed & 0xFFFFFFFF

    def nxt():
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF

    return nxt


def build(outdir: Path, grid: int = 24, spacing: float = 800.0,
          seed: int = 7) -> dict:
    import shapefile

    outdir.mkdir(parents=True, exist_ok=True)
    rnd = _rng(seed)
    origin_x, origin_y = 230000.0, 2660000.0  # plausible UTM-ish metres

    def node_id(ix: int, iy: int) -> int:
        return iy * grid + ix + 1

    def node_xy(ix: int, iy: int):
        return origin_x + ix * spacing, origin_y + iy * spacing

    # ---- network shapefile ----------------------------------------------
    w = shapefile.Writer(str(outdir / "sample_network"), shapeType=shapefile.POLYLINE)
    w.field("OBJECTID", "N", 10, 0)
    w.field("A", "N", 10, 0)
    w.field("B", "N", 10, 0)
    w.field("LINK_2040", "N", 4, 0)
    w.field("LTYPE_2040", "N", 6, 0)
    w.field("LANE_2040", "N", 4, 0)
    w.field("SHAPE_Leng", "N", 18, 6)
    w.field("RAIL", "N", 4, 0)
    w.field("LT40_OWAY", "N", 6, 0)

    oid = 0
    n_links = 0
    for iy in range(grid):
        for ix in range(grid):
            a = node_id(ix, iy)
            ax, ay = node_xy(ix, iy)
            for dx, dy in ((1, 0), (0, 1)):
                jx, jy = ix + dx, iy + dy
                if jx >= grid or jy >= grid:
                    continue
                b = node_id(jx, jy)
                bx, by = node_xy(jx, jy)
                oid += 1
                # Facility class banding: a few freeways/arterials, mostly
                # collectors/locals, scattered by position.
                on_spine = (ix % 8 == 0) or (iy % 8 == 0)
                on_art = (ix % 4 == 0) or (iy % 4 == 0)
                r = rnd()
                if on_spine and r < 0.8:
                    ltype, lanes = 5, 3          # fwy
                elif on_art and r < 0.7:
                    ltype, lanes = 20, 2         # art
                elif r < 0.5:
                    ltype, lanes = 24, 1         # coll
                else:
                    ltype, lanes = 28, 1         # local
                length = math.hypot(bx - ax, by - ay)
                oneway = 0
                if ltype == 5 and rnd() < 0.15:
                    oneway = 5  # mark a few freeway segments one-way
                w.line([[[ax, ay], [bx, by]]])
                w.record(oid, a, b, 1, ltype, lanes, length, 0, oneway)
                n_links += 1
    w.close()
    _write_prj(outdir / "sample_network.prj")

    # ---- land-use CSV ----------------------------------------------------
    # Zones = a coarser grid of cells; centroid at the cell middle.
    zcols = ["Z", "DISTRICT", "DISTNAME", "AREATYPE", "AREATYPE2", "URBAN_RURA",
             "METRO_AREA", "METRO_ACCESS", "REG", "PRODSECTOR", "FREIGHT",
             "SHAPEAREA", "LU_CLASS", "POP_TOT", "HH", "WORKER", "STUDENT",
             "LABOURER", "GFA_TOTAL", "RES_GFA", "RETAIL_GFA", "OFFICE_GFA",
             "IND_GFA", "SCHOOL_GFA", "MED_GFA", "OTHER_GFA", "ACTIVITY",
             "CENTROIDX", "CENTROIDY"]
    zgrid = grid - 1
    zones = []
    z = 0
    centre = zgrid / 2.0
    for iy in range(zgrid):
        for ix in range(zgrid):
            z += 1
            cx = origin_x + (ix + 0.5) * spacing
            cy = origin_y + (iy + 0.5) * spacing
            district = (ix // 4) * 100 + (iy // 4)
            dist_from_centre = math.hypot(ix - centre, iy - centre)
            urban = 1 if dist_from_centre < zgrid * 0.35 else 2
            areatype = 1 if dist_from_centre < zgrid * 0.18 else (
                2 if urban == 1 else 4)
            density = max(0.0, 1.0 - dist_from_centre / (zgrid * 0.7))
            pop = int(density * 4000 * (0.5 + rnd()))
            workers = int(density * 2200 * (0.4 + rnd()))
            students = int(pop * 0.18)
            hh = int(pop / 4.2) if pop else 0
            retail = density * 9000 * rnd()
            office = density * 14000 * rnd()
            ind = (1.0 - density) * 12000 * rnd()
            school = density * 5000 * rnd()
            res = pop * 35.0
            gfa = retail + office + ind + school + res
            metro_access = 1 if (urban == 1 and rnd() < 0.4) else 0
            zones.append([
                z, district, f"D{district}", areatype, areatype, urban,
                1 if urban == 1 else 0, metro_access, ix // 6 + 1,
                1 if ind > office else 2, 1 if ind > office else 0,
                round((spacing / 1000.0) ** 2, 4),
                1 if urban == 1 else 3, pop, hh, workers, students,
                int(ind / 50), round(gfa, 1), round(res, 1), round(retail, 1),
                round(office, 1), round(ind, 1), round(school, 1),
                round(gfa * 0.05, 1), round(gfa * 0.05, 1),
                round(pop + workers, 1), round(cx, 2), round(cy, 2),
            ])
    with open(outdir / "sample_landuse.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(zcols)
        wr.writerows(zones)

    # ---- OD matrix (long) ------------------------------------------------
    # Simple gravity-ish synthetic: trips ~ prod_i * attr_j / dist^2.
    cents = [(row[27], row[28]) for row in zones]
    prod = [max(1.0, row[13] * 1.2 + row[15] * 0.9) for row in zones]  # pop,wkr
    attr = [max(1.0, row[15] + row[20] * 0.01) for row in zones]
    n_od = 0
    with open(outdir / "sample_od.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["origin_zone", "destination_zone", "trips"])
        for i, (oi, (ox, oy)) in enumerate(zip(prod, cents)):
            denom = 0.0
            weights = []
            for j, (dx, dy) in enumerate(cents):
                if i == j:
                    weights.append(0.0)
                    continue
                d = math.hypot(ox - dx, oy - dy) / 1000.0 + 0.5
                wv = attr[j] / (d * d)
                weights.append(wv)
                denom += wv
            if denom <= 0:
                continue
            for j, wv in enumerate(weights):
                if wv <= 0:
                    continue
                trips = oi * wv / denom
                if trips < 0.05:
                    continue
                wr.writerow([i + 1, j + 1, round(trips, 3)])
                n_od += 1

    return {"links": n_links, "zones": len(zones), "od_pairs": n_od,
            "nodes": grid * grid}


def _write_prj(path: Path) -> None:
    path.write_text(
        'PROJCS["WGS_1984_UTM_Zone_40N",GEOGCS["GCS_WGS_1984",'
        'DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
        'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
        'PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",57.0],'
        'UNIT["Meter",1.0]]'
    )


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("sample_data")
    g = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    stats = build(out, grid=g)
    print(f"Wrote sample data to {out}/")
    for k, v in stats.items():
        print(f"  {k}: {v}")
