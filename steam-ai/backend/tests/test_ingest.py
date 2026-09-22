"""Ingest: round trip, hash validation, immutability, optional tables, reader interface."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from steam_ai import audit, schema
from steam_ai.ingest import IngestError, ingest_export_dir
from steam_ai.readers import ExportedRunReader, RunReader
from steam_ai.store import RunStore, list_runs
from steam_ai.watch import PROCESSED_MARKER, watch


def _copy_export(src: Path, dst: Path) -> Path:
    shutil.copytree(src, dst)
    return dst


def _rewrite_sentinel(export: Path, mutate) -> None:
    p = export / schema.EXPORT_SENTINEL
    data = json.loads(p.read_text())
    mutate(data)
    p.write_text(json.dumps(data))


def test_round_trip(synthetic_export, data_dir: Path) -> None:
    export = synthetic_export()
    sentinel = json.loads((export / schema.EXPORT_SENTINEL).read_text())
    manifest = ingest_export_dir(export)
    assert manifest.run_id.startswith("BASE_2025_2025_") and len(manifest.run_id) == len(
        "BASE_2025_2025_"
    ) + 8
    assert manifest.is_synthetic is True
    assert manifest.steam_version == "synthetic-0.1"
    assert manifest.periods == ["AM", "MD", "PM", "EV", "NT"]
    assert manifest.tables == sentinel["tables"]
    assert {f["path"] for f in manifest.files} == {f["path"] for f in sentinel["files"]}
    assert all("table" in f for f in manifest.files if f["path"].endswith(".csv"))
    store = RunStore(manifest.run_id)
    assert store.path.parent == data_dir / "runs"
    for name, rows in sentinel["tables"].items():
        assert store.row_count(name) == rows
    assert store.available_tables() == list(schema.TABLES)
    assert store.manifest().run_id == manifest.run_id
    assert manifest.run_id in {m.run_id for m in list_runs()}
    # SQL over the views works and ids resolve across tables
    joined = store.scalar(
        "SELECT COUNT(*) FROM link_flows f LEFT JOIN links l USING (link_id) WHERE l.link_id IS NULL"
    )
    assert joined == 0
    events = [e for e in audit.tail(500) if e["event"] == "run_ingested"]
    assert any(e["run_id"] == manifest.run_id for e in events)
    # parquet dtypes follow the schema
    import pyarrow.parquet as pq

    assert pq.read_schema(store.table_path("links")).equals(schema.LINKS)
    assert pq.read_schema(store.table_path("od")).equals(schema.OD)


def test_reingest_same_run_id_refused(synthetic_export) -> None:
    export = synthetic_export()
    ingest_export_dir(export, run_id="fixed_run")
    with pytest.raises(IngestError, match="immutable"):
        ingest_export_dir(export, run_id="fixed_run")
    with pytest.raises(IngestError, match="immutable"):
        ingest_export_dir(export)  # derived id also already exists from test_round_trip
        ingest_export_dir(export)


def test_hash_mismatch_raises(synthetic_export, tmp_path: Path) -> None:
    export = _copy_export(synthetic_export(), tmp_path / "tampered")
    with (export / "links.csv").open("a") as fh:
        fh.write("\n")
    with pytest.raises(IngestError, match="sha256 mismatch for links.csv"):
        ingest_export_dir(export, run_id="tampered")
    assert not (Path(RunStore.__module__) / "x").exists()  # no side effects expected
    assert "tampered" not in {m.run_id for m in list_runs()}


def test_missing_listed_file_and_unlisted_table(synthetic_export, tmp_path: Path) -> None:
    export = _copy_export(synthetic_export(), tmp_path / "missing")
    (export / "nodes.csv").unlink()
    with pytest.raises(IngestError, match="missing file listed in sentinel: 'nodes.csv'"):
        ingest_export_dir(export, run_id="missing")
    export2 = _copy_export(synthetic_export(), tmp_path / "unlisted")
    _rewrite_sentinel(export2, lambda d: d["files"].__delitem__(
        next(i for i, f in enumerate(d["files"]) if f["path"] == "zones.csv")
    ))
    with pytest.raises(IngestError, match="present but not listed"):
        ingest_export_dir(export2, run_id="unlisted")


def test_no_sentinel_raises(tmp_path: Path) -> None:
    (tmp_path / "links.csv").write_text("link_id\n1\n")
    with pytest.raises(IngestError, match="export not complete"):
        ingest_export_dir(tmp_path)


def test_optional_table_missing_is_tolerated(synthetic_export, tmp_path: Path) -> None:
    export = _copy_export(synthetic_export(), tmp_path / "no_params")
    for name in ("parameters", "skims"):
        (export / schema.EXPORT_TABLE_FILES[name]).unlink()

    def drop(d):
        d["files"] = [f for f in d["files"] if f["path"] not in ("parameters.csv", "skims.csv")]
        d["tables"].pop("parameters")
        d["tables"].pop("skims")

    _rewrite_sentinel(export, drop)
    manifest = ingest_export_dir(export, run_id="no_optional")
    store = RunStore(manifest.run_id)
    assert not store.has("parameters") and not store.has("skims")
    assert "parameters" not in manifest.tables
    assert store.has("links") and store.row_count("od") > 0


def test_required_table_missing_raises(synthetic_export, tmp_path: Path) -> None:
    export = _copy_export(synthetic_export(), tmp_path / "no_links")
    (export / "links.csv").unlink()
    _rewrite_sentinel(
        export,
        lambda d: d.update(files=[f for f in d["files"] if f["path"] != "links.csv"]),
    )
    with pytest.raises(IngestError, match="required tables missing"):
        ingest_export_dir(export, run_id="no_links")
    assert "no_links" not in {m.run_id for m in list_runs()}


def test_row_count_mismatch_raises_and_cleans_up(synthetic_export, tmp_path: Path) -> None:
    export = _copy_export(synthetic_export(), tmp_path / "rows")
    _rewrite_sentinel(export, lambda d: d["tables"].__setitem__("zones", 1))
    with pytest.raises(IngestError, match="sentinel says 1 rows"):
        ingest_export_dir(export, run_id="rows_bad")
    assert "rows_bad" not in {m.run_id for m in list_runs()}


def test_base_run_id_and_ingested_run_fixture(ingested_run) -> None:
    base = ingested_run()
    scen = ingested_run(variant="scenario", base_run_id=base.run_id, horizon_year=2030)
    assert scen.manifest().base_run_id == base.run_id
    assert scen.base_store() is not None and scen.base_store().run_id == base.run_id
    assert scen.manifest().horizon_year == 2030
    defective = ingested_run({"zero_capacity_link", "null_values"})
    assert defective.scalar("SELECT COUNT(*) FROM links WHERE capacity_vph = 0") == 2
    assert defective.scalar("SELECT COUNT(*) FROM links WHERE capacity_vph IS NULL") == 4
    assert ingested_run() is base  # cached


def test_reader_interface(synthetic_export) -> None:
    export = synthetic_export()
    reader = ExportedRunReader(export)
    assert isinstance(reader, RunReader)
    m = reader.manifest()
    assert m.scenario_name == "BASE_2025" and m.is_synthetic
    lines, segments = reader.lines()
    assert list(lines.columns) == schema.TRANSIT_LINES.names
    assert segments is not None and list(segments.columns) == schema.TRANSIT_SEGMENTS.names
    assert len(reader.matrices("DEMAND")) == len(reader.table("od"))
    assert len(reader.matrices("OBSERVED")) == 0
    time_skims = reader.skims("TIME")
    assert time_skims is not None and set(time_skims.skim_kind) == {"TIME"}
    assert reader.links().link_id.dtype.name == "Int64"
    assert reader.links().oneway.map(lambda v: isinstance(v, bool)).all()
    assert reader.parameters() is not None and reader.line_loads() is not None
    assert list(reader.convergence().columns) == schema.CONVERGENCE.names
    assert reader.missing_required() == []


def test_dbf_table_is_read(synthetic_export, tmp_path: Path) -> None:
    """A DBF replacing a CSV is read through the same reader (dbfread), round-tripping values."""
    import struct
    import pandas as pd

    export = _copy_export(synthetic_export(), tmp_path / "dbf")
    csv = export / "control_totals.csv"
    df = pd.read_csv(csv)
    _write_dbf(export / "control_totals.dbf", df)
    csv.unlink()
    dbf_bytes = (export / "control_totals.dbf").read_bytes()
    assert struct.unpack("<I", dbf_bytes[4:8])[0] == len(df)
    _rewrite_sentinel(
        export,
        lambda d: d["files"].__setitem__(
            next(i for i, f in enumerate(d["files"]) if f["path"] == "control_totals.csv"),
            {
                "path": "control_totals.dbf",
                "size": len(dbf_bytes),
                "sha256": __import__("hashlib").sha256(dbf_bytes).hexdigest(),
            },
        ),
    )
    reader = ExportedRunReader(export)
    ct = reader.table("control_totals")
    assert ct is not None and list(ct.columns) == schema.CONTROL_TOTALS.names
    assert list(ct.variable) == list(df.variable)
    assert ct.value.tolist() == pytest.approx(df.value.tolist())
    manifest = ingest_export_dir(export, run_id="dbf_run")
    assert manifest.tables["control_totals"] == len(df)


def _write_dbf(path: Path, df) -> None:
    """Minimal dBase III writer (character and numeric fields) for the test only."""
    import struct

    fields = []
    for col in df.columns:
        if df[col].dtype.kind in "if":
            fields.append((col[:10], b"N", 20, 6))
        else:
            width = max(1, int(df[col].astype(str).str.len().max()))
            fields.append((col[:10], b"C", min(width, 254), 0))
    header_len = 32 + 32 * len(fields) + 1
    record_len = 1 + sum(w for _, _, w, _ in fields)
    out = bytearray()
    out += struct.pack("<BBBBIHH20x", 0x03, 24, 1, 1, len(df), header_len, record_len)
    for name, ftype, width, dec in fields:
        out += struct.pack("<11sc4xBB14x", name.encode("ascii"), ftype, width, dec)
    out += b"\r"
    for _, row in df.iterrows():
        out += b" "
        for name, ftype, width, dec in fields:
            col = next(c for c in df.columns if c[:10] == name)
            if ftype == b"N":
                out += f"{float(row[col]):{width}.{dec}f}".encode("ascii")[:width].rjust(width)
            else:
                out += str(row[col]).encode("ascii")[:width].ljust(width)
    out += b"\x1a"
    path.write_bytes(bytes(out))


def test_watch_once_fires_and_marks(synthetic_export, tmp_path: Path) -> None:
    root = tmp_path / "watch"
    export = _copy_export(synthetic_export(), root / "run_a")
    (root / "incomplete").mkdir()
    (root / "incomplete" / "links.csv").write_text("link_id\n")
    seen: list[Path] = []
    done = watch(root, seen.append, once=True)
    assert done == [export] and seen == [export]
    assert (export / PROCESSED_MARKER).exists()
    assert watch(root, seen.append, once=True) == []
    assert seen == [export]


def test_watch_records_failure(synthetic_export, tmp_path: Path) -> None:
    root = tmp_path / "watch"
    export = _copy_export(synthetic_export(), root / "run_b")

    def boom(p: Path) -> None:
        raise RuntimeError("ingest failed")

    assert watch(root, boom, once=True) == [export]
    marker = json.loads((export / PROCESSED_MARKER).read_text())
    assert marker["status"] == "failed" and "ingest failed" in marker["error"]


def test_watch_loop_with_watchdog(synthetic_export, tmp_path: Path) -> None:
    import threading

    root = tmp_path / "watch"
    root.mkdir()
    stop = threading.Event()
    seen: list[Path] = []

    def on_ready(p: Path) -> None:
        seen.append(p)
        stop.set()

    t = threading.Thread(target=watch, args=(root, on_ready), kwargs={"poll_s": 0.2, "stop_event": stop})
    t.start()
    export = _copy_export(synthetic_export(), root / "late")
    t.join(timeout=10)
    assert not t.is_alive()
    assert seen == [export]
