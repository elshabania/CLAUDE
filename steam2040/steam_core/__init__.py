"""STEAM 2040 shared core.

Decoders, network model, CSR routing graph, land-use loader and the Numba
shortest-path kernels used by both the Traffic Assignment application
(``steam_assignment``) and the Network Viewer / Zone Aggregation application
(``steam_viewer``).
"""

from .settings import Settings, ClassDefaults
from .classify import classify_ltype, FACILITY_CLASSES, PROTECTED_LTYPES
from .network import Network, load_network
from .landuse import Zones, load_zones
from .matrix import load_od_long, ODMatrix
from .graph import CSRGraph, build_csr
from .cache import save_network_cache, load_network_cache

__all__ = [
    "Settings",
    "ClassDefaults",
    "classify_ltype",
    "FACILITY_CLASSES",
    "PROTECTED_LTYPES",
    "Network",
    "load_network",
    "Zones",
    "load_zones",
    "load_od_long",
    "ODMatrix",
    "CSRGraph",
    "build_csr",
    "save_network_cache",
    "load_network_cache",
]

__version__ = "0.1.0"
