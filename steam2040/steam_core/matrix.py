"""Long-format origin-destination matrix loader.

The CUBE ``.MAT`` format is proprietary; the engine consumes a long CSV with
three columns ``origin_zone, destination_zone, trips`` (header optional, sparse
zeros may be omitted), as specified in Part 1C.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class ODMatrix:
    """Sparse OD triples plus a fast (o,d)->trips lookup."""

    origin: np.ndarray       # int64 zone ids
    dest: np.ndarray         # int64 zone ids
    trips: np.ndarray        # float64

    @property
    def n_pairs(self) -> int:
        return len(self.trips)

    def total(self) -> float:
        return float(self.trips.sum())

    def scaled(self, factor: float) -> "ODMatrix":
        return ODMatrix(self.origin.copy(), self.dest.copy(),
                        self.trips * factor)


def load_od_long(path: str | Path) -> ODMatrix:
    """Read a long-format OD CSV.

    A header row is auto-detected (first row that is not three numbers).
    Intrazonal (o == d) cells are kept here; the loader does not drop them so
    daily-total checks stay exact — the assignment skips them at load time.
    """
    path = Path(path)
    origins, dests, trips = [], [], []
    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        for line in reader:
            if len(line) < 3:
                continue
            try:
                o = int(float(line[0]))
                d = int(float(line[1]))
                t = float(line[2])
            except ValueError:
                continue  # header or comment row
            origins.append(o)
            dests.append(d)
            trips.append(t)
    return ODMatrix(
        np.asarray(origins, dtype=np.int64),
        np.asarray(dests, dtype=np.int64),
        np.asarray(trips, dtype=np.float64),
    )
