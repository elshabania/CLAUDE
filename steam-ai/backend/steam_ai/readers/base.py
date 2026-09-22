"""RunReader protocol (data_contract.md Section 8.1).

A reader turns one source layout into the internal tables of ``schema.py``.
Ingest writes what the reader returns; checks never touch readers. Each table
method returns a DataFrame with the schema's columns (extra columns are
dropped at write time), or ``None`` when an optional table is absent.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import pandas as pd

from ..models import RunManifest


@runtime_checkable
class RunReader(Protocol):
    """Interface every run reader implements."""

    def manifest(self) -> RunManifest: ...

    def links(self) -> pd.DataFrame: ...

    def nodes(self) -> pd.DataFrame: ...

    def zones(self) -> pd.DataFrame: ...

    def land_use(self) -> pd.DataFrame: ...

    def lines(self) -> tuple[pd.DataFrame, pd.DataFrame | None]:
        """(transit_lines, transit_segments)."""
        ...

    def link_flows(self) -> pd.DataFrame: ...

    def line_loads(self) -> pd.DataFrame | None: ...

    def matrices(self, kind: str = "DEMAND") -> pd.DataFrame:
        """Long-form OD rows for one ``matrix_kind`` (non-zero cells only)."""
        ...

    def skims(self, kind: str = "TIME") -> pd.DataFrame | None:
        """Long-form skim rows for one ``skim_kind``."""
        ...

    def convergence(self) -> pd.DataFrame: ...

    def parameters(self) -> pd.DataFrame | None: ...

    def table(self, name: str) -> pd.DataFrame | None:
        """Any internal table by its ``schema.TABLES`` name, or None when absent."""
        ...
