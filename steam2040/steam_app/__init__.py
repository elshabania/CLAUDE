"""STEAM 2040 Studio — the merged application.

A single controller (:class:`~steam_app.state.AppState`) unifies the Traffic
Assignment engine (Prompt A) and the Network Viewer + Zone Aggregation engine
(Prompt B) over one data model.  The GUI is a thin view over this controller,
and the AI assistant drives the exact same capability registry the buttons do.
"""

from .state import AppState
from .capabilities import build_registry, Capability, CapabilityRegistry
from .assistant import Assistant, ClaudeBackend, OfflineBackend

__all__ = [
    "AppState",
    "build_registry", "Capability", "CapabilityRegistry",
    "Assistant", "ClaudeBackend", "OfflineBackend",
]
