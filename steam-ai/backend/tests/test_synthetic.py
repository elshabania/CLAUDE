"""Synthetic generator: determinism, schema conformance, and every defect manifesting."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pytest

from steam_ai import schema
from steam_ai.synthetic import ALL_DEFECTS, defect_manifest, generate_run
from steam_ai.synthetic.generate import DEFECTS_FILE, README_NAME


def _csv_hashes(path: Path) -> dict[str, str]:
    return {
        f: hashlib.sha256((path / f).read_bytes()).hexdigest()
        for f in schema.EXPORT_TABLE_FILES.values()
    }


def _read(path: Path, table: str) -> pd.DataFrame:
    sch = schema.TABLES[table]
    str_cols = {f.name: "string" for f in sch if pa.types.is_string(f.type)}
    return pd.read_csv(path / schema.EXPORT_TABLE_FILES[table], dtype=str_cols)


@pytest.fixture(scope="module")
def clean(synthetic_export) -> Path:
    return synthetic_export()


@pytest.fixture(scope="module")
def all_defects(synthetic_export) -> Path:
    return synthetic_export(ALL_DEFECTS)


def test_deterministic_and_fast(tmp_path: Path) -> None:
    t = time.perf_counter()
    a = generate_run(tmp_path / "a", seed=3)
    elapsed = time.perf_counter() - t
    b = generate_run(tmp_path / "b", seed=3)
    assert _csv_hashes(a) == _csv_hashes(b)
    assert (a / DEFECTS_FILE).read_text() == (b / DEFECTS_FILE).read_text()
    assert elapsed < 30.0
    c = generate_run(tmp_path / "c", seed=4)
    assert _csv_hashes(a)["link_flows.csv"] != _csv_hashes(c)["link_flows.csv"]


def test_export_layout_and_sentinel(clean: Path) -> None:
    sentinel = json.loads((clean / schema.EXPORT_SENTINEL).read_text())
    assert sentinel["is_synthetic"] is True
    assert sentinel["steam_version"] == "synthetic-0.1"
    assert sentinel["scenario_name"] == "BASE_2025" and sentinel["horizon_year"] == 2025
    assert set(sentinel["tables"]) == set(schema.TABLES)
    listed = {f["path"] for f in sentinel["files"]}
    assert set(schema.EXPORT_TABLE_FILES.values()) <= listed
    assert README_NAME in listed and DEFECTS_FILE in listed
    assert "SYNTHETIC" in (clean / README_NAME).read_text()
    # sentinel is written last
    mtimes = [(clean / f["path"]).stat().st_mtime_ns for f in sentinel["files"]]
    assert (clean / schema.EXPORT_SENTINEL).stat().st_mtime_ns >= max(mtimes)
    for f in sentinel["files"]:
        assert hashlib.sha256((clean / f["path"]).read_bytes()).hexdigest() == f["sha256"]
        assert (clean / f["path"]).stat().st_size == f["size"]


@pytest.mark.parametrize("table", sorted(schema.TABLES))
def test_tables_conform_to_schema(clean: Path, table: str) -> None:
    df = _read(clean, table)
    sch = schema.TABLES[table]
    assert list(df.columns) == sch.names
    sentinel = json.loads((clean / schema.EXPORT_SENTINEL).read_text())
    assert len(df) == sentinel["tables"][table]
    assert len(df) > 0
    # coercible to the arrow schema without loss
    coerced = df.copy()
    for f in sch:
        if pa.types.is_string(f.type):
            coerced[f.name] = coerced[f.name].astype(object).where(coerced[f.name].notna(), None)
    pa.Table.from_pandas(coerced, schema=sch, preserve_index=False, safe=False)
    assert (df["source_file"] == schema.EXPORT_TABLE_FILES[table]).all()
    if "source_row" in sch.names:
        assert (df["source_row"].to_numpy() == np.arange(1, len(df) + 1)).all()


def test_clean_network_is_consistent(clean: Path) -> None:
    links, nodes = _read(clean, "links"), _read(clean, "nodes")
    zones = _read(clean, "zones")
    node_ids = set(nodes.node_id)
    assert set(links.a_node) <= node_ids and set(links.b_node) <= node_ids
    assert (links.capacity_vph > 0).all() and (links.ffs_kph > 0).all()
    assert links.capacity_vph.notna().all()
    assert set(links.link_class) == {"FWY", "ART", "COL", "LOC", "CONN"}
    assert set(links.area_type) <= {"CBD", "URB", "SUB", "RUR"}
    assert set(links.junction_type) <= {"NONE", "SIGNAL", "ROUNDABOUT", "PRIORITY"}
    assert links.geometry_wkt.str.startswith("LINESTRING(").all()
    assert zones.geometry_wkt.str.startswith("POLYGON((").all()
    assert nodes.x.between(54.3, 54.6).all() and nodes.y.between(24.35, 24.55).all()
    # every link has a reverse (two-way), no dead ends, every non-centroid node has links
    pairs = set(zip(links.a_node, links.b_node, strict=True))
    assert all((b, a) in pairs for a, b in pairs)
    assert node_ids == set(links.a_node) | set(links.b_node)
    centroids = set(nodes.loc[nodes.is_centroid, "node_id"])
    assert centroids == set(zones.zone_id)
    conn = links[links.link_class == "CONN"]
    assert set(conn.a_node) | set(conn.b_node) >= centroids
    fwy_nodes = set(links.loc[links.link_class == "FWY", "a_node"])
    assert not (set(conn.b_node) & fwy_nodes)


def test_clean_land_use_matches_control_totals(clean: Path) -> None:
    lu, ct = _read(clean, "land_use"), _read(clean, "control_totals")
    sums = lu.groupby("variable").value.sum()
    for _, row in ct.iterrows():
        assert row.region == "ALL"
        assert sums[row.variable] == pytest.approx(row.value)
    assert set(lu.variable) == {"POP", "EMP_TOTAL", "EMP_RETAIL", "STUDENTS", "HOTEL_ROOMS"}


def test_clean_flows_are_physical(clean: Path) -> None:
    lf, links = _read(clean, "link_flows"), _read(clean, "links")
    assert set(lf.period) == {"AM", "MD", "PM", "EV", "NT"}
    assert set(lf.user_class) == {"CAR", "LGV", "HGV", "ALL"}
    assert (lf.vc_ratio < 1.3).all()
    m = lf.merge(links[["link_id", "ffs_kph"]], on="link_id")
    assert (m.cong_speed_kph <= m.ffs_kph + 1e-6).all()
    assert (m.cong_speed_kph >= 5.0).all()
    piv = lf.pivot_table(index=["link_id", "period"], columns="user_class", values="volume")
    assert np.allclose(piv["ALL"], piv["CAR"] + piv["LGV"] + piv["HGV"], atol=0.05)
    am = lf[(lf.period == "AM") & (lf.user_class == "ALL")]
    assert am.volume.sum() > 0 and am.vc_ratio.max() > 0.5


def test_clean_convergence_and_noise(clean: Path) -> None:
    conv, itf = _read(clean, "convergence"), _read(clean, "iteration_flows")
    final = conv[(conv.stage == "HWY_ASSIGN") & (conv.metric == "REL_GAP")]
    last = final.sort_values("iteration").groupby("period").value.last()
    assert (last < 0.001).all()
    assert {"REL_GAP", "GEH_PREV_ITER", "MAX_FLOW_CHANGE"} <= set(conv.metric)
    assert "DEMAND_LOOP" in set(conv.stage)
    assert itf.groupby("period").iteration.nunique().eq(3).all()
    lf = _read(clean, "link_flows")
    all_am = lf[(lf.period == "AM") & (lf.user_class == "ALL")].set_index("link_id").volume
    last_it = itf[(itf.period == "AM") & (itf.iteration == itf.iteration.max())].set_index(
        "link_id"
    )
    assert np.allclose(last_it.volume.reindex(all_am.index), all_am)


def test_clean_demand_skims_transit(clean: Path) -> None:
    od, sk = _read(clean, "od"), _read(clean, "skims")
    assert (od.trips > 0).all()
    assert set(od.purpose) == {"HBW", "HBO", "NHB"} and set(od["mode"]) == {"CAR", "PT"}
    assert set(od.matrix_kind) == {"DEMAND"}
    intra = od[od.origin == od.destination].trips.sum() / od.trips.sum()
    assert intra < 0.15
    assert set(sk.skim_kind) == {"TIME", "DIST"} and set(sk["mode"]) == {"CAR", "PT"}
    assert len(sk) == 60 * 60 * 2 * 2 * 5
    tl, ts, ll = (
        _read(clean, "transit_lines"),
        _read(clean, "transit_segments"),
        _read(clean, "line_loads"),
    )
    assert 6 <= tl.line_id.nunique() <= 10
    assert {"BUS", "BRT", "METRO"} == set(tl.mode)
    assert tl.headway_min.between(2, 120).all()
    nodes = set(_read(clean, "nodes").node_id)
    assert set(ts.from_node) | set(ts.to_node) <= nodes
    for _, g in ts.sort_values("seq").groupby("line_id"):
        assert (g.to_node.to_numpy()[:-1] == g.from_node.to_numpy()[1:]).all()
    assert ll.groupby("line_id").load.max().gt(0).all()
    params = _read(clean, "parameters")
    assert len(params) >= 15 and (params.value == params.approved_value).all()


def test_manifest_ids_exist_and_are_written(all_defects: Path) -> None:
    manifest = defect_manifest(ALL_DEFECTS)
    assert set(manifest) == ALL_DEFECTS
    on_disk = json.loads((all_defects / DEFECTS_FILE).read_text())["defects"]
    assert on_disk == json.loads(json.dumps(manifest))
    links, nodes = _read(all_defects, "links"), _read(all_defects, "nodes")
    zones, tl = _read(all_defects, "zones"), _read(all_defects, "transit_lines")
    for entry in manifest.values():
        for lid in entry.get("link_ids", []):
            assert lid in set(links.link_id), entry
        for zid in entry.get("zone_ids", []):
            assert zid in set(zones.zone_id), entry
        for line in entry.get("line_ids", []):
            assert line in set(tl.line_id), entry
    for nid in manifest["orphan_nodes"]["node_ids"] + manifest["oneway_dead_end"]["node_ids"]:
        assert nid in set(nodes.node_id)
    assert manifest["missing_node_ref"]["node_ids"][0] not in set(nodes.node_id)


def test_each_defect_manifests(all_defects: Path) -> None:
    m = defect_manifest(ALL_DEFECTS)
    links, nodes = _read(all_defects, "links"), _read(all_defects, "nodes")
    lf, od = _read(all_defects, "link_flows"), _read(all_defects, "od")
    tl, ts = _read(all_defects, "transit_lines"), _read(all_defects, "transit_segments")
    ll, ct = _read(all_defects, "line_loads"), _read(all_defects, "control_totals")
    lu, conv = _read(all_defects, "land_use"), _read(all_defects, "convergence")
    params = _read(all_defects, "parameters")
    used = set(links.a_node) | set(links.b_node)

    assert set(m["orphan_nodes"]["node_ids"]) <= set(nodes.node_id) - used
    zc = links[links.link_id.isin(m["zero_capacity_link"]["link_ids"])]
    assert (zc.capacity_vph == 0).all() and len(zc) == 2
    assert (links[links.link_id.isin(m["zero_speed_link"]["link_ids"])].ffs_kph == 0).all()
    dead = m["oneway_dead_end"]["node_ids"][0]
    assert dead in set(links.b_node) and dead not in set(links.a_node)
    assert links.loc[links.link_id == m["oneway_dead_end"]["link_ids"][0], "oneway"].item()
    fwy_nodes = set(links.loc[links.link_class == "FWY", "a_node"])
    bad_conn = links[links.link_id.isin(m["connector_on_fwy"]["link_ids"])]
    assert (bad_conn.link_class == "CONN").all()
    assert (set(bad_conn.a_node) | set(bad_conn.b_node)) & fwy_nodes
    seg = ts[ts.line_id == "BUS_1"].sort_values("seq")
    assert (seg.to_node.to_numpy()[:-1] != seg.from_node.to_numpy()[1:]).any()
    bad_h = tl[tl.line_id == "BUS_2"].set_index("period").headway_min
    assert bad_h["AM"] < 2 and bad_h["NT"] > 120
    assert 99999 in set(ts.loc[ts.line_id == "BUS_3", "to_node"])
    assert 99999 not in set(nodes.node_id)
    pop_ct = ct.loc[ct.variable == "POP", "value"].item()
    assert abs(pop_ct / lu[lu.variable == "POP"].value.sum() - 1.12) < 0.01
    am = lf[(lf.period == "AM") & (lf.user_class == "ALL")].set_index("link_id")
    over = am.loc[m["overcapacity_corridor"]["link_ids"]]
    assert (over.vc_ratio >= 1.3).all() and len(over) == 10
    assert set(am[am.vc_ratio >= 1.3].index) == set(m["overcapacity_corridor"]["link_ids"])
    low = m["low_volume_outlier"]["link_ids"][0]
    peers = links[(links.link_class == "ART") & (links.area_type == "URB")].link_id
    assert am.loc[low, "volume"] < 0.02 * am.loc[peers].volume.median()
    neg = od[od.trips < 0]
    cells = {tuple(c) for c in m["negative_matrix_cells"]["cells"]}
    assert set(zip(neg.origin, neg.destination, strict=True)) == cells
    assert set(neg.purpose) == {"HBW"} and set(neg["mode"]) == {"CAR"} and set(neg.period) == {"AM"}
    zi = m["row_col_imbalance"]["zone_ids"][0]
    car = od[od["mode"] == "CAR"]
    ratio = car[car.origin == zi].trips.sum() / car[car.destination == zi].trips.sum()
    assert ratio > 5.0
    zh = m["high_intrazonal"]["zone_ids"][0]
    row = od[od.origin == zh]
    share = row[row.destination == zh].trips.sum() / row.trips.sum()
    assert abs(share - 0.4) < 0.02
    gap = conv[(conv.stage == "HWY_ASSIGN") & (conv.metric == "REL_GAP")]
    last = gap.sort_values("iteration").groupby("period").value.last()
    assert last["AM"] == pytest.approx(0.02) and last["PM"] < 0.001
    pm = lf[(lf.period == "PM") & (lf.user_class == "ALL")].merge(links[["link_id", "ffs_kph"]])
    fast = pm[pm.link_id.isin(m["speed_above_ffs"]["link_ids"])]
    assert (fast.cong_speed_kph > fast.ffs_kph * 1.05).all() and len(fast) == 3
    slow = am.loc[m["speed_below_floor"]["link_ids"]]
    assert (slow.cong_speed_kph < 5.0).all()
    drift = params[params.value != params.approved_value]
    assert set(drift.key) == set(m["parameter_drift"]["keys"])
    missing = links[links.link_id == m["missing_node_ref"]["link_ids"][0]]
    assert missing.b_node.item() not in set(nodes.node_id)
    nulls = links[links.capacity_vph.isna()]
    assert set(nulls.link_id) == set(m["null_values"]["link_ids"]) and len(nulls) == 4
    assert ll[ll.line_id == "BUS_UNUSED"].load.max() < 1.0
    assert ll[ll.line_id != "BUS_UNUSED"].groupby("line_id").load.max().gt(20).all()
    assert "BUS_UNUSED" in set(tl.line_id)


def test_trip_length_shift_lengthens_hbw_car(synthetic_export) -> None:
    base = synthetic_export(variant="scenario")
    shifted = synthetic_export({"trip_length_shift"}, variant="scenario")

    def mean_len(path: Path) -> tuple[float, float]:
        od, sk = _read(path, "od"), _read(path, "skims")
        d = sk[(sk.skim_kind == "DIST") & (sk["mode"] == "CAR") & (sk.period == "AM")]
        hbw = od[(od.purpose == "HBW") & (od["mode"] == "CAR")].merge(
            d, on=["origin", "destination"]
        )
        hbo = od[(od.purpose == "HBO") & (od["mode"] == "CAR")].merge(
            d, on=["origin", "destination"]
        )
        return (
            (hbw.trips * hbw.value).sum() / hbw.trips.sum(),
            (hbo.trips * hbo.value).sum() / hbo.trips.sum(),
        )

    b_hbw, b_hbo = mean_len(base)
    s_hbw, s_hbo = mean_len(shifted)
    assert s_hbw / b_hbw == pytest.approx(1.4, rel=0.03)
    assert s_hbo == pytest.approx(b_hbo, rel=1e-6)


def test_variants(synthetic_export) -> None:
    base = synthetic_export()
    scen = synthetic_export(variant="scenario", horizon_year=2030, scenario="GROWTH_2030")
    unexp = synthetic_export(variant="scenario_unexplained", horizon_year=2030)
    zones = _read(base, "zones")
    lu_b = _read(base, "land_use").merge(zones[["zone_id", "sector_id"]])
    lu_s = _read(scen, "land_use").merge(zones[["zone_id", "sector_id"]])
    grown = lu_s.groupby("sector_id").value.sum() / lu_b.groupby("sector_id").value.sum()
    assert grown[["S1", "S2"]].between(1.13, 1.17).all()
    assert grown[["S3", "S4", "S5", "S6"]].eq(1.0).all()
    lb, ls = _read(base, "links").set_index("link_id"), _read(scen, "links").set_index("link_id")
    widened = ls[ls.lanes > lb.lanes.reindex(ls.index)]
    assert len(widened) > 0 and (widened.link_class == "FWY").all()
    assert set(_read(scen, "transit_lines").line_id) - set(
        _read(base, "transit_lines").line_id
    ) == {"BUS_NEW"}
    sent = json.loads((scen / schema.EXPORT_SENTINEL).read_text())
    assert sent["horizon_year"] == 2030 and sent["scenario_name"] == "GROWTH_2030"
    # unexplained: S4 demand up ~30% vs scenario with identical land use and network there
    assert _read(unexp, "land_use").equals(_read(scen, "land_use"))
    assert _read(unexp, "links").equals(_read(scen, "links"))
    sec = dict(zip(zones.zone_id, zones.sector_id, strict=True))
    od_s, od_u = _read(scen, "od"), _read(unexp, "od")

    def within(df: pd.DataFrame, sector: str) -> float:
        return df[df.origin.map(sec).eq(sector) & df.destination.map(sec).eq(sector)].trips.sum()

    assert within(od_u, "S4") / within(od_s, "S4") == pytest.approx(1.3, rel=0.01)
    assert within(od_u, "S1") == pytest.approx(within(od_s, "S1"), rel=1e-6)


def test_bad_arguments(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        generate_run(tmp_path, defects={"not_a_defect"})
    with pytest.raises(ValueError):
        generate_run(tmp_path, variant="nope")
    with pytest.raises(ValueError):
        defect_manifest({"bogus"})
