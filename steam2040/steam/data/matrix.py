"""Origin-destination matrix loader (section 2C).

Long-format CSV exported from CUBE: ``origin_zone, destination_zone, trips``.
Zero cells may be omitted. Stored as a sparse COO triple keyed on zone id, then
mapped to dense zone *indices* once the zone table is known.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass

import numpy as np


@dataclass
class ODMatrix:
    origin: np.ndarray      # int64 origin zone id
    dest: np.ndarray        # int64 destination zone id
    trips: np.ndarray       # float32 24-hour trips

    @property
    def total(self) -> float:
        return float(self.trips.sum())

    def to_index(self, zone_id_to_index: dict):
        """Return (oi, di, trips) using dense zone indices; drop unknown ids
        and intrazonal (O==D) cells which do not load the network."""
        oi, di, tr = [], [], []
        for o, d, t in zip(self.origin, self.dest, self.trips):
            io = zone_id_to_index.get(int(o))
            idd = zone_id_to_index.get(int(d))
            if io is None or idd is None or io == idd or t <= 0:
                continue
            oi.append(io)
            di.append(idd)
            tr.append(t)
        return (np.asarray(oi, dtype=np.int64),
                np.asarray(di, dtype=np.int64),
                np.asarray(tr, dtype=np.float32))


def load_matrix(path: str) -> ODMatrix:
    o, d, t = [], [], []
    with open(path, newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        # tolerate header or no header
        if header and not _looks_numeric(header[0]):
            pass
        elif header:
            _push(o, d, t, header)
        for row in reader:
            _push(o, d, t, row)
    return ODMatrix(np.asarray(o, dtype=np.int64),
                    np.asarray(d, dtype=np.int64),
                    np.asarray(t, dtype=np.float32))


def _push(o, d, t, row):
    if len(row) < 3:
        return
    try:
        trips = float(row[2])
    except ValueError:
        return
    if trips <= 0:
        return
    o.append(int(float(row[0])))
    d.append(int(float(row[1])))
    t.append(trips)


def _looks_numeric(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False
