"""Fast binary cache of a parsed :class:`~steam_core.network.Network`.

Parsing the 200k-link shapefile is slow; the parsed arrays are dumped to a
single ``.npz`` so a second launch is near-instant.  The cache is keyed by the
source file's path, size and mtime so a stale cache is detected automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from .network import Network

CACHE_VERSION = 2


def _source_stamp(source: str | Path) -> str:
    p = Path(source)
    try:
        st = p.stat()
        return f"{p.resolve()}|{st.st_size}|{int(st.st_mtime)}"
    except OSError:
        return str(p)


def save_network_cache(net: Network, path: str | Path,
                       source: str | Path | None = None) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        path,
        version=np.int64(CACHE_VERSION),
        source=np.str_(_source_stamp(source) if source else ""),
        link_id=net.link_id, node_a=net.node_a, node_b=net.node_b,
        klass=net.klass, ltype=net.ltype, lanes=net.lanes, length=net.length,
        oneway=net.oneway, node_xy=net.node_xy, node_raw=net.node_raw,
        geom_xy=net.geom_xy, geom_off=net.geom_off,
    )
    return path


def load_network_cache(path: str | Path,
                       source: str | Path | None = None) -> Network | None:
    """Load a cached network, or ``None`` if missing / stale / wrong version."""
    path = Path(path)
    if not path.exists():
        return None
    try:
        z = np.load(path, allow_pickle=False)
    except (OSError, ValueError):
        return None
    if "version" not in z.files or int(z["version"]) != CACHE_VERSION:
        return None
    if source is not None and str(z["source"]) != _source_stamp(source):
        return None
    net = Network(
        link_id=z["link_id"], node_a=z["node_a"], node_b=z["node_b"],
        klass=z["klass"], ltype=z["ltype"], lanes=z["lanes"],
        length=z["length"], oneway=z["oneway"], node_xy=z["node_xy"],
        node_raw=z["node_raw"], geom_xy=z["geom_xy"], geom_off=z["geom_off"],
    )
    return net
