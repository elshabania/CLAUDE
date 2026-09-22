#!/usr/bin/env python3
"""Sequentially-numbered zonal shapefiles + lookup files.

Zone IDs in each shapefile run 0..N-1 with NO gaps (sorted by original
representative zone ID, so numbering is stable and deterministic). Each
level also gets a lookup CSV with one row per ORIGINAL zone:
  ORIG_ZONE_ID, NEW_ZONE_ID, REP_ORIG_ID, IS_REP
so any original zone (e.g. an OD matrix row) maps straight to its new
sequential zone."""
import json, struct, pathlib, zipfile, shutil, csv

DIR = pathlib.Path(__file__).parent
DATA = json.loads((DIR / "zones-export.json").read_text())
PRJ = (pathlib.Path("/tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad/shp/Network Shape file/v322_AD_20250606_v19.prj").read_text())
ALL_IDS = sorted(r["id"] for r in DATA["L0_as_received"]["rows"])   # the 3,670 original zones

def shp_header(shape_type, bbox, file_len_words):
    h = struct.pack(">i", 9994) + b"\x00" * 20 + struct.pack(">i", file_len_words)
    h += struct.pack("<ii", 1000, shape_type)
    h += struct.pack("<4d", *bbox) + struct.pack("<4d", 0, 0, 0, 0)
    return h

def write_points(path, pts):
    bbox = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
    recs, idx, off = b"", b"", 50
    for i, (x, y) in enumerate(pts):
        content = struct.pack("<i2d", 1, x, y)
        recs += struct.pack(">ii", i + 1, len(content) // 2) + content
        idx += struct.pack(">ii", off, len(content) // 2)
        off += 4 + len(content) // 2
    path.with_suffix(".shp").write_bytes(shp_header(1, bbox, off) + recs)
    path.with_suffix(".shx").write_bytes(shp_header(1, bbox, 50 + len(pts) * 4) + idx)

def write_lines(path, lines):
    xs = [c for l in lines for c in (l[0], l[2])]; ys = [c for l in lines for c in (l[1], l[3])]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    recs, idx, off = b"", b"", 50
    for i, (x0, y0, x1, y1) in enumerate(lines):
        content = struct.pack("<i4d", 3, min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
        content += struct.pack("<iii", 1, 2, 0) + struct.pack("<4d", x0, y0, x1, y1)
        recs += struct.pack(">ii", i + 1, len(content) // 2) + content
        idx += struct.pack(">ii", off, len(content) // 2)
        off += 4 + len(content) // 2
    path.with_suffix(".shp").write_bytes(shp_header(3, bbox, off) + recs)
    path.with_suffix(".shx").write_bytes(shp_header(3, bbox, 50 + len(lines) * 4) + idx)

def write_dbf(path, rows):
    fields = [("ZONE_ID", "N", 8, 0), ("ORIG_ID", "N", 10, 0), ("MEMBERS", "N", 6, 0), ("TRIPENDS", "N", 12, 1), ("MERGED", "N", 1, 0)]
    hdr = struct.pack("<BBBBIHH20x", 3, 126, 7, 6, len(rows), 33 + 32 * len(fields), 1 + sum(f[2] for f in fields))
    fdesc = b"".join(struct.pack("<11sc4xBB14x", f[0].encode(), f[1].encode(), f[2], f[3]) for f in fields) + b"\x0d"
    body = b""
    for r in rows:
        body += b" " + ("%8d" % r["new"]).encode() + ("%10d" % r["id"]).encode() \
              + ("%6d" % r["members"]).encode() + ("%12.1f" % r["tripends"]).encode() \
              + ("%1d" % (1 if r["members"] > 1 else 0)).encode()
    path.with_suffix(".dbf").write_bytes(hdr + fdesc + body + b"\x1a")

for key, lvl_data in DATA.items():
    rows = sorted(lvl_data["rows"], key=lambda r: r["id"])
    for new, r in enumerate(rows): r["new"] = new          # sequential 0..N-1, no gaps
    rep_of = {}                                            # original member -> representative
    for mem, rep in lvl_data["pairs"]: rep_of[mem] = rep
    new_of_rep = {r["id"]: r["new"] for r in rows}

    lvl = DIR / ("seq_" + key)
    if lvl.exists(): shutil.rmtree(lvl)
    lvl.mkdir()
    cent = lvl / (key + "_centroids"); conn = lvl / (key + "_connectors")
    write_points(cent, [(r["cx"], r["cy"]) for r in rows]); write_dbf(cent, rows)
    write_lines(conn, [(r["cx"], r["cy"], r["nx"], r["ny"]) for r in rows]); write_dbf(conn, rows)
    for p in (cent, conn): p.with_suffix(".prj").write_text(PRJ)

    lut = lvl / ("lookup_" + key + ".csv")
    with open(lut, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ORIG_ZONE_ID", "NEW_ZONE_ID", "REP_ORIG_ID", "IS_REP"])
        for oid in ALL_IDS:
            rep = oid
            hop = 0
            while rep in rep_of and hop < 60: rep = rep_of[rep]; hop += 1
            w.writerow([oid, new_of_rep[rep], rep, 1 if rep == oid else 0])

    zp = DIR / (key + "_seq_shapefiles.zip")
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(lvl.iterdir()): z.write(f, f.name)
    # sanity: sequential coverage
    news = [r["new"] for r in rows]
    assert news == list(range(len(rows))), key + " numbering has gaps!"
    print(f"{key}: zones 0..{len(rows)-1} (no gaps) · lookup {len(ALL_IDS)} rows → {zp.name} ({zp.stat().st_size//1024} KB)")
print("DONE")
