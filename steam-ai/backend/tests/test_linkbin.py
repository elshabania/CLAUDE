"""links.bin encoding round-trips the links table (api/linkbin.py)."""

from __future__ import annotations

import math

import pytest
from fixtures_mini import make_run, mini_data_dir, mini_tables  # noqa: F401

from steam_ai.api import linkbin

pytestmark = pytest.mark.usefixtures("mini_data_dir")


def _coords(wkt: str) -> list[tuple[float, float]]:
    body = wkt[wkt.index("(") + 1: wkt.rindex(")")]
    return [tuple(map(float, p.split())) for p in body.split(",")]


@pytest.mark.parametrize("with_flows", [True, False])
def test_round_trip(with_flows: bool) -> None:
    t = mini_tables()
    if not with_flows:
        t.pop("link_flows")
    store = make_run("r", t)
    header, arr = linkbin.decode(linkbin.encode(store, "AM"))
    links = store.query("SELECT * FROM links ORDER BY link_id")
    assert header["n"] == len(links) and header["has_flows"] is with_flows
    assert list(arr["link_id"]) == list(links["link_id"])
    xy = arr["coords"].astype(float).reshape(-1, 2).cumsum(axis=0) / header["scale"]
    xy += header["origin"]
    start = arr["start"]
    for i, w in enumerate(links["geometry_wkt"]):
        got = xy[start[i]:start[i + 1]]
        for (x, y), (gx, gy) in zip(_coords(w), got, strict=True):
            assert abs(x - gx) < 1e-6 and abs(y - gy) < 1e-6
    classes = header["classes"]
    assert [classes[c] for c in arr["link_class"]] == list(links["link_class"])
    assert list(arr["capacity_vph"]) == pytest.approx(list(links["capacity_vph"]))
    if with_flows:
        vol = store.query("SELECT l.link_id, f.volume FROM links l LEFT JOIN link_flows f "
                          "ON f.link_id = l.link_id AND f.period = 'AM' AND "
                          "f.user_class = 'ALL' ORDER BY l.link_id")["volume"]
        for a, b in zip(arr["volume"], vol, strict=True):
            assert (math.isnan(a) and b != b) or a == pytest.approx(b, rel=1e-6)
    else:
        assert all(math.isnan(v) for v in arr["volume"])
