"""Compact binary encoding of a run's links for the map (``links.bin``).

A real STEAM network has ~150K links and ~700K vertices. As GeoJSON that is
tens of megabytes and hundreds of thousands of small objects in the browser;
this format is one ArrayBuffer the web app turns straight into deck.gl
attribute buffers (frontend ``src/map/linkbin.ts`` decodes it).

Layout (little-endian)::

    b"SAL1" | uint32 header_len | header JSON (space-padded to 8 bytes)
    | array 0 | pad to 8 | array 1 | pad to 8 | ...

The header lists every array with its dtype, element count and byte offset
from the start of the buffer, plus lookup lists for the coded columns
(link class, area type, sector). Coordinates are int32 micro-degrees,
delta-encoded along the whole vertex stream (first vertex relative to
``origin``), which gzip compresses well. Missing numbers are NaN; missing
codes are the dtype's maximum value.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from ..store import RunStore

MAGIC = b"SAL1"
SCALE = 1_000_000  # micro-degrees



def _codes(values: pd.Series, missing: int) -> tuple[np.ndarray, list[str]]:
    cats = sorted({str(v) for v in values.dropna().unique()})
    idx = {c: i for i, c in enumerate(cats)}
    out = np.array([idx.get(str(v), missing) if v is not None and v == v else missing
                    for v in values], dtype=np.int64)
    return out, cats


def _parse_coords(wkts: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    """LINESTRING WKT -> (vertex counts, flat [x0, y0, x1, y1, ...] float64)."""
    counts = np.zeros(len(wkts), dtype=np.int64)
    parts: list[str] = []
    for i, w in enumerate(wkts):
        if not isinstance(w, str) or not w.startswith("LINESTRING"):
            continue
        body = w[w.index("(") + 1: w.rindex(")")]
        pts = body.split(",")
        counts[i] = len(pts)
        parts.extend(pts)
    if not parts:
        return counts, np.zeros(0)
    flat = np.array(" ".join(parts).split(), dtype=np.float64)
    return counts, flat


def link_frame(store: RunStore, period: str | None) -> tuple[pd.DataFrame, bool]:
    """Links with the flow columns for ``period`` (NaN when the run has no flows)."""
    has_flows = store.has("link_flows") and period is not None
    if has_flows:
        df = store.query(
            "SELECT l.*, f.volume, f.vc_ratio, f.cong_speed_kph, f.delay_s FROM links l "
            "LEFT JOIN link_flows f ON f.link_id = l.link_id AND f.period = ? "
            "AND f.user_class = 'ALL' ORDER BY l.link_id", [period])
    else:
        df = store.query("SELECT * FROM links ORDER BY link_id")
        for c in ("volume", "vc_ratio", "cong_speed_kph", "delay_s"):
            df[c] = np.nan
    return df, has_flows


def finding_counts(store: RunStore) -> dict[int, tuple[int, int]]:
    """link_id -> (number of findings, worst severity rank)."""
    counts: dict[int, tuple[int, int]] = {}
    for f in store.findings():
        if f.location.type.value != "link":
            continue
        try:
            lid = int(f.location.id)
        except ValueError:
            continue
        n, worst = counts.get(lid, (0, 99))
        counts[lid] = (n + 1, min(worst, f.severity.rank))
    return counts


def encode(store: RunStore, period: str | None) -> bytes:
    df, has_flows = link_frame(store, period)
    n = len(df)
    counts, flat = _parse_coords(df["geometry_wkt"])
    n_pts = int(counts.sum())
    xy = flat.reshape(-1, 2) if n_pts else np.zeros((0, 2))
    origin = [float((xy[:, 0].min() + xy[:, 0].max()) / 2), float((xy[:, 1].min() + xy[:, 1].max()) / 2)] \
        if n_pts else [0.0, 0.0]
    q = np.rint((xy - origin) * SCALE).astype(np.int64)
    deltas = np.diff(q, axis=0, prepend=np.zeros((1, 2), dtype=np.int64)) if n_pts else q
    start = np.zeros(n + 1, dtype=np.uint32)
    start[1:] = np.cumsum(counts)

    cls, classes = _codes(df["link_class"], 255)
    area, area_types = _codes(df["area_type"], 255)
    if "sector_id" in df:
        sec, sectors = _codes(df["sector_id"], 65535)
    else:
        sec, sectors = np.full(n, 65535), []
    fc = finding_counts(store)
    ids = df["link_id"].to_numpy(dtype=np.int64)
    nfind = np.array([fc.get(int(i), (0, 99))[0] for i in ids], dtype=np.int64)
    sev = np.array([fc[int(i)][1] if int(i) in fc else -1 for i in ids], dtype=np.int64)
    lanes = df["lanes"].to_numpy(dtype=np.float64)
    lanes = np.where(np.isnan(lanes), 255, np.clip(lanes, 0, 254)).astype(np.uint8)

    def f32(col: str) -> np.ndarray:
        return pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=np.float32) \
            if col in df else np.full(n, np.nan, dtype=np.float32)

    arrays: list[tuple[str, np.ndarray]] = [
        ("link_id", ids.astype(np.uint32)),
        ("a_node", df["a_node"].to_numpy(dtype=np.int64).astype(np.uint32)),
        ("b_node", df["b_node"].to_numpy(dtype=np.int64).astype(np.uint32)),
        ("start", start),
        ("coords", deltas.astype(np.int32).ravel()),
        ("capacity_vph", f32("capacity_vph")),
        ("ffs_kph", f32("ffs_kph")),
        ("length_m", f32("length_m")),
        ("volume", f32("volume")),
        ("vc_ratio", f32("vc_ratio")),
        ("cong_speed_kph", f32("cong_speed_kph")),
        ("delay_s", f32("delay_s")),
        ("sector", sec.astype(np.uint16)),
        ("n_findings", np.clip(nfind, 0, 65535).astype(np.uint16)),
        ("link_class", cls.astype(np.uint8)),
        ("area_type", area.astype(np.uint8)),
        ("lanes", lanes),
        ("max_severity", sev.astype(np.int8)),
    ]
    src_files = df["source_file"].dropna().astype(str)
    header: dict[str, Any] = {
        "version": 1, "n": n, "n_pts": n_pts, "origin": origin, "scale": SCALE,
        "period": period if has_flows else None, "has_flows": bool(has_flows),
        "classes": classes, "area_types": area_types, "sectors": sectors,
        "source_file": src_files.mode().iloc[0] if len(src_files) else None,
        "source_row_is_link_id": bool(len(df) and "source_row" in df
                                      and (df["source_row"].astype("Int64") == df["link_id"]).all()),
        "arrays": [],
    }

    def pad8(b: bytes) -> bytes:
        return b + b"\0" * (-len(b) % 8)

    # Offsets depend on the header length, which depends on the offsets:
    # reserve a generous fixed-size header and fill it in afterwards.
    blobs = [pad8(a.tobytes()) for _, a in arrays]
    for reserve in (4096, 16384, 65536, 1 << 20):
        off = 8 + reserve
        header["arrays"] = []
        for (name, a), blob in zip(arrays, blobs, strict=True):
            header["arrays"].append({"name": name, "dtype": a.dtype.name, "count": int(a.size),
                                     "offset": off})
            off += len(blob)
        hb = json.dumps(header, separators=(",", ":")).encode()
        if len(hb) <= reserve:
            break
    else:  # pragma: no cover - a header over 1 MB means something is badly wrong
        raise ValueError("links.bin header too large")
    hb = hb + b" " * (reserve - len(hb))
    return MAGIC + np.uint32(reserve).tobytes() + hb + b"".join(blobs)


def decode(buf: bytes) -> tuple[dict[str, Any], dict[str, np.ndarray]]:
    """Inverse of :func:`encode` (used by the tests)."""
    if buf[:4] != MAGIC:
        raise ValueError("not a links.bin buffer")
    hlen = int(np.frombuffer(buf[4:8], dtype=np.uint32)[0])
    header = json.loads(buf[8: 8 + hlen].decode().strip())
    arrays = {a["name"]: np.frombuffer(buf, dtype=a["dtype"], count=a["count"], offset=a["offset"])
              for a in header["arrays"]}
    return header, arrays
