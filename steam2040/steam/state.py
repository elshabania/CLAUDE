"""Shared application state: the loaded network/zones/matrix plus the most
recent assignment, aggregation and scenario. Commands mutate this; the server
serialises slices of it to the front end."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from .config import Params
from .data.network import Network
from .data.zones import Zones
from .data.matrix import ODMatrix
from .graph import CSRGraph, build_csr, connect_zones
from .engine.assignment import AssignResult


@dataclass
class AppState:
    params: Params = field(default_factory=Params)
    network: Optional[Network] = None
    graph: Optional[CSRGraph] = None
    zones: Optional[Zones] = None
    matrix: Optional[ODMatrix] = None
    zone_id_to_index: dict = field(default_factory=dict)
    last_result: Optional[AssignResult] = None
    baseline_result: Optional[AssignResult] = None
    aggregation: object = None

    def set_network(self, net: Network):
        self.network = net
        self.graph = build_csr(net)
        if self.zones is not None:
            self._connect_zones()

    def set_zones(self, zones: Zones):
        self.zones = zones
        self.zone_id_to_index = {int(z): i for i, z in enumerate(zones.z)}
        if self.graph is not None:
            self._connect_zones()

    def set_matrix(self, m: ODMatrix):
        self.matrix = m

    def _connect_zones(self):
        self.zones.node = connect_zones(self.graph, self.zones.centroid)

    @property
    def ready(self) -> bool:
        return self.network is not None and self.graph is not None
