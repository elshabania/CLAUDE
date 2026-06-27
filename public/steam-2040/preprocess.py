#!/usr/bin/env python3
"""Convert STEAM input CSVs into compact, gzipped typed-array blobs for the
browser STEAM 2040 Studio. All arrays are little-endian; the page reads them
back as typed arrays after gunzip via DecompressionStream."""
import csv, gzip, json, sys, os, math
from array import array

SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def write_blob(name, arr):
    raw = arr.tobytes()
    with gzip.open(os.path.join(OUT, name + ".gz"), "wb", compresslevel=6) as f:
        f.write(raw)
    print(f"  {name}.gz  {len(raw)/1e6:.2f}MB raw -> {os.path.getsize(os.path.join(OUT,name+'.gz'))/1e6:.2f}MB")

# ---- facility classification (verified against the guide's class counts) ----
# 0 freeway 1 ramp 2 arterial 3 collector 4 rural 5 local 6 junction
def facility(lt):
    lt = int(lt)
    if   1  <= lt <= 9:  return 0   # freeway
    elif 10 <= lt <= 19: return 1   # ramp
    elif 20 <= lt <= 21: return 2   # arterial
    elif 22 <= lt <= 27: return 3   # collector
    elif 28 <= lt <= 29: return 5   # local
    elif 30 <= lt <= 39: return 4   # rural
    else:                return 6   # junction (40-44)

FAC = ["freeway","ramp","arterial","collector","rural","local","junction"]
CAP = [2000,1500,900,700,600,500,600]      # veh/h per lane
SPD = [100,60,60,50,80,30,30]              # km/h free-flow

# ---------------------------------------------------------------- NETWORK ----
print("network links...")
node_index = {}
node_x = array('f'); node_y = array('f')
def nid(node):
    i = node_index.get(node)
    if i is None:
        i = len(node_index); node_index[node] = i
        node_x.append(0.0); node_y.append(0.0)  # placeholder, set below
    return i

link_from = array('i'); link_to = array('i')
link_class = array('B'); link_lanes = array('B'); link_len = array('f')
geom_coords = array('f'); geom_off = array('i', [0])

with open(os.path.join(SRC, "STEAM_network_links.csv")) as f:
    r = csv.reader(f); next(r)
    for A,B,lt,ln,L,wkt in r:
        fi = nid(A); ti = nid(B)
        link_from.append(fi); link_to.append(ti)
        link_class.append(facility(lt))
        lanes = max(1, min(255, int(ln)))
        link_lanes.append(lanes)
        link_len.append(float(L))
        body = wkt[wkt.index("(")+1: wkt.rindex(")")]
        pts = body.split(",")
        for k, c in enumerate(pts):
            xs, ys = c.split()
            x = float(xs); y = float(ys)
            geom_coords.append(x); geom_coords.append(y)
            if k == 0:
                node_x[fi] = x; node_y[fi] = y
            if k == len(pts)-1:
                node_x[ti] = x; node_y[ti] = y
        geom_off.append(len(geom_coords)//2)

NL = len(link_from); NN = len(node_index)
print(f"  links={NL} nodes={NN}")
write_blob("node_xy.f32", array('f', [v for pair in zip(node_x, node_y) for v in pair]))
write_blob("link_from.i32", link_from)
write_blob("link_to.i32", link_to)
write_blob("link_class.u8", link_class)
write_blob("link_lanes.u8", link_lanes)
write_blob("link_len.f32", link_len)
write_blob("geom_off.i32", geom_off)
write_blob("geom_xy.f32", geom_coords)

# robust default view bbox from node coords (1st/99th percentile)
xs = sorted(node_x); ys = sorted(node_y)
def pct(a, p): return a[min(len(a)-1, max(0, int(len(a)*p)))]
bbox = [pct(xs,0.005), pct(ys,0.005), pct(xs,0.995), pct(ys,0.995)]

# ------------------------------------------------------------------ ZONES ----
print("zones...")
ATTR = ["POP_TOT","HH","WORKER","STUDENT","LABOURER","GFA_TOTAL","RES_GFA",
        "RETAIL_GFA","OFFICE_GFA","IND_GFA","SCHOOL_GFA","MED_GFA","OTHER_GFA",
        "ACTIVITY","SHAPEAREA"]
INTS = ["DISTRICT","AREATYPE","AREATYPE2","URBAN_RURA","METRO_ACCESS","LU_CLASS"]
rows = {}
maxz = 0
dist_name = {}
with open(os.path.join(SRC, "STEAM_landuse_2040.csv")) as f:
    r = csv.DictReader(f)
    for row in r:
        z = int(row["Z"]); maxz = max(maxz, z); rows[z] = row
        dist_name[int(row["DISTRICT"])] = row["DISTNAME"]

Z = maxz
zone_xy = array('f', [0.0])*(2*Z)
zone_attr = array('f', [0.0])*(len(ATTR)*Z)
zone_int = array('h', [0])*(len(INTS)*Z)
for z, row in rows.items():
    i = z-1
    zone_xy[2*i]   = float(row["CENTROIDX"])
    zone_xy[2*i+1] = float(row["CENTROIDY"])
    for k,a in enumerate(ATTR):
        try: zone_attr[k*Z + i] = float(row[a])
        except: zone_attr[k*Z + i] = 0.0
    for k,a in enumerate(INTS):
        try: zone_int[k*Z + i] = int(float(row[a]))
        except: zone_int[k*Z + i] = 0
write_blob("zone_xy.f32", zone_xy)
write_blob("zone_attr.f32", zone_attr)
write_blob("zone_int.i16", zone_int)

# ----------------------------------------- nearest network node per zone -----
print("zone -> nearest node (grid)...")
gx0,gy0,gx1,gy1 = bbox
GS = 500.0  # 500 m grid cells
gw = max(1, int((gx1-gx0)/GS)+1); gh = max(1, int((gy1-gy0)/GS)+1)
grid = {}
for i in range(NN):
    x = node_x[i]; y = node_y[i]
    if x < gx0 or x > gx1 or y < gy0 or y > gy1: continue
    cx = int((x-gx0)/GS); cy = int((y-gy0)/GS)
    grid.setdefault((cx,cy), []).append(i)
zone_node = array('i', [-1])*Z
for z, row in rows.items():
    i = z-1
    x = zone_xy[2*i]; y = zone_xy[2*i+1]
    if x < gx0 or x > gx1 or y < gy0 or y > gy1: continue
    cx = int((x-gx0)/GS); cy = int((y-gy0)/GS)
    best = -1; bestd = 1e30
    rad = 0
    while best < 0 and rad <= 12:
        for dx in range(-rad, rad+1):
            for dy in range(-rad, rad+1):
                if rad>0 and abs(dx)!=rad and abs(dy)!=rad: continue
                for j in grid.get((cx+dx,cy+dy), ()):
                    d = (node_x[j]-x)**2 + (node_y[j]-y)**2
                    if d < bestd: bestd = d; best = j
        rad += 1
    zone_node[i] = best
write_blob("zone_node.i32", zone_node)

# ------------------------------------------------------------------ MATRIX ----
print("matrix...")
maxo = 3685
# bucket rows by origin to build CSR
from collections import defaultdict
buckets = defaultdict(list)  # origin -> list[(dest, trips)]
total = 0.0
with open(os.path.join(SRC, "STEAM_matrix_long.csv")) as f:
    r = csv.reader(f); next(r)
    for o,d,t in r:
        o=int(o); d=int(d); t=float(t)
        if o>maxo or d>maxo: continue
        buckets[o].append((d,t)); total += t
mat_off = array('i', [0])
mat_dest = array('H'); mat_trips = array('f')
for o in range(1, maxo+1):
    for d,t in buckets.get(o, ()):
        mat_dest.append(d); mat_trips.append(t)
    mat_off.append(len(mat_dest))
write_blob("matrix_off.i32", mat_off)
write_blob("matrix_dest.u16", mat_dest)
write_blob("matrix_trips.f32", mat_trips)
print(f"  matrix entries={len(mat_dest)} total trips={total:.0f}")

# ------------------------------------------------------------------- META ----
meta = {
    "version": "3.2.2",
    "counts": {"links": NL, "nodes": NN, "zones": Z, "matrixZones": maxo,
               "matrixEntries": len(mat_dest)},
    "facilities": FAC, "capPerLane": CAP, "freeSpeed": SPD,
    "bpr": {"alpha": 0.15, "beta": 4},
    "facilityCounts": {},
    "bbox": bbox,
    "attrNames": ATTR, "intNames": INTS,
    "districts": {str(k): v for k,v in sorted(dist_name.items())},
    "totals": {"population": int(sum(zone_attr[i] for i in range(Z))),
               "trips": round(total)},
}
fc = [0]*7
for c in link_class: fc[c]+=1
meta["facilityCounts"] = {FAC[i]: fc[i] for i in range(7)}
with open(os.path.join(OUT, "meta.json"), "w") as f:
    json.dump(meta, f, separators=(",",":"))
print("meta:", json.dumps(meta["counts"]), meta["facilityCounts"])
print("done.")
