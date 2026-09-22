"""Deterministic synthetic miniature STEAM-like run generator (labelled synthetic).

Public entry points live in :mod:`steam_ai.synthetic.generate`.
"""

from .generate import ALL_DEFECTS, defect_manifest, generate_run

__all__ = ["ALL_DEFECTS", "defect_manifest", "generate_run"]
