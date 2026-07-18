#!/usr/bin/env python3
"""One workbook: renumbering sheet per aggregation approach at 3150 & 3000
zones, each with methodology + results. Externals always numbered last."""
import json, pathlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

DIR = pathlib.Path(__file__).parent
D = json.loads((DIR / "renum-all.json").read_text())
PRE = json.loads((DIR / "preload-agg.json").read_text())["results"]
IDS = sorted(D.pop("__ids"))
EXT = [z for z in IDS if z >= 5995]

AR = Font(name="Arial", size=9.5)
BOLD = Font(name="Arial", size=9.5, bold=True)
HDR = Font(name="Arial", size=10, bold=True, color="FFFFFF")
TITLE = Font(name="Arial", size=12.5, bold=True)
SUB = Font(name="Arial", size=9, color="444444")
HFILL = PatternFill("solid", fgColor="1F3864")
MERGED = PatternFill("solid", fgColor="FFF2CC")
EXTF = PatternFill("solid", fgColor="DDEBF7")
THIN = Border(*[Side(style="thin", color="BFBFBF")] * 4)

FAMDESC = {
 "gehx": ("GEHX exact-guard", "Network-aware, error-guarded aggregation. Stage 1 merges zones sharing the same road attachment node (their demand loads at the identical point, so the assignment is provably unchanged - GEH 0 on every link). Stage 2, if the target needs more, moves the smallest-demand zones to the nearest surviving zone; a six-variant race confirmed this policy optimal. External stations are frozen (never merged)."),
 "nnd": ("NND demand-weighted", "Adjacent-first merging where inter-zone distances are inflated by the zones' demand, so high-demand zones resist merging and low-demand zones merge first."),
 "qtd": ("QTD demand quadtree", "Quadtree that keeps splitting the cell with the most DEMAND until roughly the target number of occupied leaves; every zone in a leaf merges. Balances demand per zone rather than area."),
 "nn": ("NN adjacent-first", "Greedy nearest-pair merging: repeatedly merge the closest zone clusters until the target count. Purely geometric."),
 "ward": ("WARD variance-minimising", "Hierarchical merging minimising d^2 * n1*n2/(n1+n2) - keeps clusters compact and size-balanced. Produces the same partition as NN at these fine levels (singleton merges dominate)."),
 "kmeans": ("KM k-means", "Lloyd's algorithm: exactly k compact clusters by iterative centroid assignment. Ignores adjacency and demand."),
 "kcenter": ("KC k-center", "Farthest-point coverage: picks centres minimising the worst zone-to-centre distance, then assigns zones to the nearest centre."),
 "hex": ("HEX hexagonal cells", "Fixed pointy-top hexagonal binning, cell size solved so occupied cells match the target; every zone in a cell merges."),
 "grid": ("GRID square cells", "Square-cell binning, size solved to the target count; every zone in a cell merges."),
 "quad": ("QT quadtree (area)", "Quadtree splitting the fullest AREA cell until ~target occupied leaves. Density-adaptive by count, not demand."),
 "bal": ("BAL size-balanced", "Ward-family criterion d^2 * (n1+n2) that resists mega-clusters. Same partition as NN at these fine levels."),
 "ring": ("RING rings x sectors", "Concentric rings x angular sectors around the network centre, occupancy-adaptive. Cannot hit exact zone counts; the achieved count is stated below."),
}
PROTOCOL = ("Scores: identical 800-origin pre-sampled trips assigned on full zones (demand-matched baseline) and on the aggregated zones, "
            "BPR rerouting, whole network, carrying links only. Renumbering: internal zones first, sequential from 0 with no gaps, sorted by the "
            "representative's original ID; the 6 external stations (orig 5995-6000, blue) always keep the LAST positions, in original order, never merged. "
            "Merged internal zones (amber, IS_REP=0) map to their representative's new ID.")

def pre_metrics(key):
    m, t = key.rsplit("_", 1); t = int(t)
    for r in PRE:
        c = r.get("cfg", {})
        if m == "gehx" and c.get("gehx") and c.get("target") == t: return r
        if c.get("custom") == m and c.get("target") == t: return r
    return None

def root_fn(pairs):
    rep = {a: b for a, b in pairs}
    def root(z):
        n = 0
        while z in rep and n < 60: z = rep[z]; n += 1
        return z
    return root

wb = Workbook()
idx = wb.active; idx.title = "Index"
idx["A1"] = "Zone renumbering — every aggregation approach at 3,150 and 3,000 zones"; idx["A1"].font = TITLE
idx["A2"] = PROTOCOL; idx["A2"].font = SUB; idx["A2"].alignment = Alignment(wrap_text=True)
idx.merge_cells("A2:F2"); idx.row_dimensions[2].height = 52
for c, h in enumerate(["Sheet", "Method", "Target", "Zones achieved", "GEH<5 (%)", "GEH<2 (%)"], 1):
    cell = idx.cell(4, c, h); cell.font = HDR; cell.fill = HFILL; cell.border = THIN

ORDER = [f"{m}_{t}" for t in (3150, 3000) for m in
         ("gehx","nnd","qtd","nn","ward","bal","kmeans","kcenter","hex","grid","quad","ring")]
SHEETN = {"gehx":"GEHX","nnd":"NND","qtd":"QTD","nn":"NN","ward":"WARD","bal":"BAL",
          "kmeans":"KM","kcenter":"KC","hex":"HEX","grid":"GRID","quad":"QT","ring":"RING"}
irow = 5
for key in ORDER:
    dat = D[key]; m, t = key.rsplit("_", 1)
    name = f"{SHEETN[m]} {t}"
    root0 = root_fn(dat["pairs"])
    idset = set(IDS)
    # canonicalise: a representative must itself be a model zone — clusters whose
    # union-find root lies outside the model table re-root to their smallest
    # in-table member (the viewer's zone universe has 22 extra display zones)
    clus = {}
    for z in IDS: clus.setdefault(root0(z), []).append(z)
    canon = {}
    for r0, mem in clus.items():
        canon[r0] = r0 if r0 in idset else min(mem)
    def root(z): return canon[root0(z)]
    reps = sorted({root(z) for z in IDS})
    int_reps = [r for r in reps if r not in EXT]
    new_of = {r: i for i, r in enumerate(int_reps)}
    for k, e in enumerate(sorted(EXT)): new_of[e] = len(int_reps) + k
    assert sorted(new_of.values()) == list(range(len(reps))), name
    members = {}
    for z in IDS: members[root(z)] = members.get(root(z), 0) + 1

    ws = wb.create_sheet(name)
    fam, desc = FAMDESC[m]
    met = pre_metrics(key)
    ws["A1"] = f"{fam} @ target {t} — zone renumbering"; ws["A1"].font = TITLE
    ws["A2"] = "METHODOLOGY: " + desc; ws["A2"].font = SUB
    ws["A2"].alignment = Alignment(wrap_text=True); ws.merge_cells("A2:F2"); ws.row_dimensions[2].height = 46
    res = f"RESULTS: {len(reps):,} zones achieved (from 3,670)"
    if met:
        res += (f" · GEH<5: {met['geh5']:.2f}% · GEH<2: {met['pctG2']:.2f}% · links within 1%: {met['pctW1']:.1f}%"
                f" · VHT error: {met['vhtErr']:.2f}% · correlation: {met['corr']:.3f} · demand internalised: {met['internPct']:.1f}%"
                f" · runtime {met['rt']:.0f}s vs baseline {met['baseRt']:.0f}s")
    res += ". " + PROTOCOL
    ws["A3"] = res; ws["A3"].font = SUB
    ws["A3"].alignment = Alignment(wrap_text=True); ws.merge_cells("A3:F3"); ws.row_dimensions[3].height = 58

    for c, h in enumerate(["ORIG_ZONE_ID","NEW_ZONE_ID","REP_ORIG_ID","IS_REP","IS_EXTERNAL","MEMBERS_IN_NEW_ZONE"], 1):
        cell = ws.cell(5, c, h); cell.font = HDR; cell.fill = HFILL; cell.border = THIN
        cell.alignment = Alignment(horizontal="center")
    for i, oid in enumerate(IDS):
        r = root(oid); row = 6 + i
        is_ext = 1 if oid in EXT else 0
        for c, v in enumerate([oid, new_of[r], r, 1 if r == oid else 0, is_ext, members[r]], 1):
            cell = ws.cell(row, c, v); cell.font = AR
        if is_ext:
            for c in range(1, 7): ws.cell(row, c).fill = EXTF
        elif r != oid:
            for c in range(1, 7): ws.cell(row, c).fill = MERGED
    for c, w in enumerate([15, 14, 14, 8, 12, 20], 1): ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = "A6"

    for c, v in enumerate([name, fam, int(t), len(reps),
                           round(met["geh5"], 2) if met else None,
                           round(met["pctG2"], 2) if met else None], 1):
        cell = idx.cell(irow, c, v); cell.font = AR; cell.border = THIN
    irow += 1
for c, w in enumerate([12, 26, 9, 14, 11, 11], 1): idx.column_dimensions[get_column_letter(c)].width = w
idx.freeze_panes = "A5"

wb.save(DIR / "Zone_Renumbering_All_Methods_3150_3000.xlsx")
print("sheets:", len(wb.sheetnames), "· size:", (DIR / "Zone_Renumbering_All_Methods_3150_3000.xlsx").stat().st_size // 1024, "KB")
