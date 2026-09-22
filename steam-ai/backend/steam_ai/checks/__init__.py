"""Diagnostic checks: one module per check, registered in :mod:`.registry`.

Import :data:`REGISTRY`, :func:`run_all` and :func:`catalogue` from
``steam_ai.checks.registry``; import :class:`Check` and the helpers from
``steam_ai.checks.base``.
"""

from .base import Check, SkipCheck, evaluate_severity, make_finding

__all__ = ["Check", "SkipCheck", "evaluate_severity", "make_finding"]
