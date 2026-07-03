"""Zone-to-network connection.

Each zone loads at its centroid via a connector to the nearest network node.
This builds the zone-row -> node-index map once with a KD-tree, as described in
Part 1B.
"""

from __future__ import annotations

import numpy as np

from .landuse import Zones
from .network import Network
from .geometry import nearest_node_map


def build_zone_node_map(zones: Zones, net: Network) -> np.ndarray:
    """Return ``zone_node[i]`` = nearest network node index for zone row ``i``.

    Zones with degenerate centroids (0,0) map to -1 (not connected).
    """
    cent = zones.centroids()
    zone_node = nearest_node_map(cent, net.node_xy)
    bad = (cent[:, 0] == 0.0) & (cent[:, 1] == 0.0)
    zone_node[bad] = -1
    return zone_node


def zone_id_to_row(zones: Zones) -> dict[int, int]:
    """Map a 1-based zone id to its row index."""
    return {int(z): i for i, z in enumerate(zones.z)}
