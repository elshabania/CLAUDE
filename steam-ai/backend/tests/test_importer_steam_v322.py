"""Recovered STEAM v3.2.2 inputs (importers/steam_v322.py)."""

from __future__ import annotations

import pytest

from steam_ai.importers import steam_v322 as imp
from steam_ai.paths import STEAM_AI_DIR

REF = STEAM_AI_DIR / "reference" / "steam_v322"


@pytest.mark.parametrize(("ltype", "cls"), [
    (1, "FWY"), (9, "FWY"), (10, "RAMP"), (20, "ART"), (22, "COL"), (28, "LOC"),
    (30, "RUR"), (45, "JUNC"), (60, None), (99, None), (0, "UNK"),
])
def test_link_class(ltype: int, cls: str | None) -> None:
    assert imp.link_class(ltype) == cls


@pytest.mark.skipif(not (REF / "network_2025_2040.bin.gz").exists(),
                    reason="reference network not present")
def test_dual_year_network_counts() -> None:
    net = imp.read_dual_year(REF / "network_2025_2040.bin.gz")
    assert net.n == 158_063
    assert int(net.in_year(2025).sum()) == 136_509
    assert int(net.in_year(2040).sum()) == 152_879
    lon, lat = imp._to_wgs84(net.xy[:1000, 0], net.xy[:1000, 1])
    # the emirate (and its external stations) lies within these bounds
    assert ((lon > 50) & (lon < 58.5)).all() and ((lat > 19) & (lat < 27)).all()
