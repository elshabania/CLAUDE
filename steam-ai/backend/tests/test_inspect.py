"""Inventory tool: classification, tabular statistics, binaries recorded not parsed, markdown."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from steam_ai.inspect_tool import classify, inspect_dir, is_id_column, render_markdown


def test_classify_and_id_columns() -> None:
    assert classify(Path("x.NET")) == "cube_network"
    assert classify(Path("a/b.mat")) == "cube_matrix"
    assert classify(Path("lines.lin")) == "transit_lines"
    assert classify(Path("t.dbf")) == "dbf" and classify(Path("t.csv")) == "csv"
    assert classify(Path("x.sqlite")) == "sqlite" and classify(Path("x.db")) == "sqlite"
    assert classify(Path("zones.shp")) == "shapefile"
    assert classify(Path("weird.bin")) == "other"
    assert is_id_column("link_id") and is_id_column("ID") and is_id_column("a_node")
    assert is_id_column("origin") and is_id_column("zone_id")
    assert not is_id_column("width") and not is_id_column("capacity_vph")


def test_inspect_export_dir(synthetic_export) -> None:
    report = inspect_dir(synthetic_export())
    files = {f["path"]: f for f in report["files"]}
    assert report["n_files"] == len(files) and report["by_family"]["csv"] == 14
    links = files["links.csv"]
    assert links["family"] == "csv" and len(links["sha256"]) == 64 and links["size"] > 0
    tab = links["tabular"]
    assert tab["rows"] == 968
    cols = {c["name"]: c for c in tab["columns"]}
    assert cols["link_id"]["distinct"] == 968
    assert cols["capacity_vph"]["min"] > 0 and cols["capacity_vph"]["max"] == 9999.0
    assert cols["link_class"]["null_rate"] == 0.0 and "min" not in cols["link_class"]
    assert "distinct" not in cols["length_m"]
    assert files["steam_ai_export_complete.json"]["family"] == "json"
    assert "tabular" not in files["README_SYNTHETIC.txt"]


def test_inspect_mixed_dir(tmp_path: Path) -> None:
    (tmp_path / "Scripts").mkdir()
    (tmp_path / "Scripts" / "HWY.s").write_text("RUN PGM=HIGHWAY\n")
    (tmp_path / "net.net").write_bytes(b"\x00\x01binary\xff" * 100)
    (tmp_path / "trips.mat").write_bytes(b"\x00" * 50)
    (tmp_path / "counts.csv").write_text("site_id,volume,note\n1,100,a\n2,,b\n2,300,\n")
    con = sqlite3.connect(tmp_path / "hwy.sqlite")
    con.execute("CREATE TABLE links (a INTEGER, b INTEGER, dist REAL)")
    con.executemany("INSERT INTO links VALUES (?,?,?)", [(1, 2, 1.5), (2, 3, 2.5)])
    con.commit()
    con.close()
    report = inspect_dir(tmp_path)
    files = {f["path"]: f for f in report["files"]}
    assert files["Scripts/HWY.s"]["family"] == "cube_script"
    assert files["net.net"]["family"] == "cube_network" and "tabular" not in files["net.net"]
    assert files["net.net"]["size"] == 900
    assert files["trips.mat"]["family"] == "cube_matrix"
    counts = files["counts.csv"]["tabular"]
    assert counts["rows"] == 3
    cols = {c["name"]: c for c in counts["columns"]}
    assert cols["site_id"]["distinct"] == 2
    assert cols["volume"]["null_rate"] == pytest.approx(1 / 3)
    assert cols["volume"]["min"] == 100 and cols["volume"]["max"] == 300
    assert files["hwy.sqlite"]["sqlite"] == [{"table": "links", "rows": 2, "columns": ["a", "b", "dist"]}]
    md = render_markdown(report)
    assert "## 4. Run directory layout" in md
    assert "| `net.net` | cube_network |" in md and "TBC via export script" in md
    assert "### `counts.csv`: 3 rows, 3 columns" in md
    assert "| site_id | Confirmed |" in md
    assert "| links | 2 | a, b, dist |" in md


def test_inspect_max_rows_and_errors(tmp_path: Path) -> None:
    (tmp_path / "big.csv").write_text("id,v\n" + "\n".join(f"{i},{i}" for i in range(50)) + "\n")
    (tmp_path / "bad.dbf").write_bytes(b"not a dbf")
    report = inspect_dir(tmp_path, max_rows=10)
    files = {f["path"]: f for f in report["files"]}
    assert files["big.csv"]["tabular"]["rows"] == 10
    assert files["big.csv"]["tabular"]["rows_sampled"] is True
    assert "error" in files["bad.dbf"] and "sha256" in files["bad.dbf"]
    assert "Error:" in render_markdown(report)
    with pytest.raises(NotADirectoryError):
        inspect_dir(tmp_path / "nope")
